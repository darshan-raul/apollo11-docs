---
title: "Initialization and seeding"
description: "Separate first-start schema creation, repeatable demo data loads, and changes to an existing database."
---

# Initialization and seeding

*Stage 3 · Mission Data*

**You will be able to:** explain which setup runs on a fresh PostgreSQL volume, which runs as a Job, and why neither automatically migrates an existing database.

## The problem

[Persistent storage](./statefulset-storage-and-operations) lets a replacement Pod reopen an existing database. The first Pod on a new volume faces a different task: creating the tables before the application can use them.

Stages 1 and 2 combined schema and demo data in initialization Jobs. Those Jobs did not rerun merely because a database Pod was replaced. Stage 3 moves schema creation into the database's first start and keeps demo data loading as a separate operation.

## Bootstrap, seed, migrate

Database setup includes three tasks with different triggers:

| Task | Meaning | Apollo example |
|---|---|---|
| **Bootstrap** | Create the initial database structure | Create `users`, `flights`, and `bookings` tables |
| **Seed** | Load a chosen baseline dataset | Insert demo users, airports, and flights |
| **Migration** | Change an existing schema while preserving required data | Add a column to a database already holding bookings |

**Idempotent** means repeating an operation leaves the same result as running it once. Apollo's seeds use SQL conflict clauses to make repeated inserts safe for the specified unique keys. A Kubernetes Job does not make SQL idempotent; the SQL must supply that behaviour.

Seeds can include production reference data in other systems. Apollo's demo users and generated flight inventory are a teaching dataset, not a recovery copy of passenger activity.

## How it works

### Why init containers deadlock on database bootstrap

Learners often wonder why schema initialization is not handled by a Kubernetes init container.

An init container runs to completion *before* any app container in the Pod is started. If an init container runs a script that executes SQL (`psql -h 127.0.0.1`), it requires the PostgreSQL server to be running and listening for connections. But PostgreSQL is packaged inside the primary application container, which Kubernetes will not start until all init containers have exited with status `0`. The init container waits for PostgreSQL to start; PostgreSQL waits for the init container to finish. Neither ever moves forward.

### The official PostgreSQL entrypoint hook

The official `postgres:15-alpine` container solves this chicken-and-egg problem internally through its startup script (`docker-entrypoint.sh`):

1. **Inspection:** At container startup, the script inspects `PGDATA`.
2. **First initialization (fresh volume):** If `PGDATA` is empty, it runs `initdb` to create the system catalogs, launches a temporary single-user PostgreSQL daemon, executes all `.sql` and `.sh` scripts found in `/docker-entrypoint-initdb.d/` in alphabetical order, stops the temporary daemon, and finally execs the real PostgreSQL server process.
3. **Subsequent restarts (existing volume):** If `PGDATA` already contains a database, the entrypoint prints `PostgreSQL database directory appears to contain a database; Skipping initialization` and starts the database server immediately.

Because the hook is executed only when the data directory is completely empty, editing an initialization ConfigMap and restarting the Pod will **never** alter an existing database.

### Why migrations require separate tooling

A **schema migration** alters an existing database schema (adding columns, creating indices, altering tables) while preserving all accumulated data. Because PostgreSQL skips `/docker-entrypoint-initdb.d` on populated volumes, and because re-running `CREATE TABLE` would fail without complex DDL guards, schema evolution cannot be solved by first-start scripts. Real-world systems run dedicated migration frameworks (such as Flyway, Liquibase, or language-specific tools like Alembic or Goose) that track applied migration versions in a dedicated tracking table.

### Idempotent seeding via decoupled Jobs

Loading initial business data (demo users, flight schedules) is decoupled from schema creation:
- It runs as an independent Kubernetes **Job** after the database Pod reports `Ready`.
- It connects over the standard network Service (`identity-db:5432`).
- It uses **idempotent SQL** (`ON CONFLICT DO NOTHING`), so if the Job is rerun, it safely skips rows that already exist without throwing errors or creating duplicates.

## Apollo example

Apollo organizes database setup across three manifests:

1. **Bootstrap ConfigMap ([`identity-db-init-script.yaml`](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-init-script.yaml)):** Contains table definitions (`CREATE TABLE IF NOT EXISTS users (...)`). Mounted at `/docker-entrypoint-initdb.d` in `identity-db-sts.yaml`.
2. **Seed ConfigMap and Job ([`seed-identity-db.yaml`](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/jobs/seed-identity-db.yaml)):**
   Runs a client container executing:
   ```bash
   until pg_isready -h identity-db -U postgres; do sleep 2; done
   psql -h identity-db -U postgres -d identity -v ON_ERROR_STOP=1 -f /init/seed.sql
   ```
   `-v ON_ERROR_STOP=1` ensures that if any SQL statement fails, `psql` exits with a non-zero code, failing the Job rather than falsely reporting success.
3. **Conflict keys across datasets:**

| Dataset | Workload | Conflict key | Behavior on repeat run |
|---|---|---|---|
| Users | `identity-db` | `id` | Existing user rows preserved |
| Airports | `flight-db` | `code` | Existing airport codes preserved |
| Flights | `flight-db` | `(flight_number, departure_time)` | Existing flights preserved; new calendar days added |
| Bookings | `booking-db` | None (`SELECT 1`) | No synthetic bookings seeded; bookings are purely runtime user activity |

The flight schedule is generated relative to `CURRENT_DATE`. Running the seed on subsequent days inserts newly relevant departures while skipping past departures, demonstrating that idempotence preserves existing keys without freezing dynamic datasets.

## Try it

After installing Stage 3, verify that the schema and seed Jobs completed:

```bash
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c '\dt'
kubectl get jobs -n apollo-airlines-apps
```

Expected:
- `\dt` lists the `users` table created by the first-start entrypoint script.
- `kubectl get jobs` reports `COMPLETIONS 1/1` for `seed-identity-db`, `seed-flight-db`, and `seed-booking-db`.

This proves that schema bootstrap and baseline data seeding ran through their respective first-boot and one-shot Job mechanisms. It does not prove that a user booking survived Pod replacement; testing that requires dynamic runtime data.

## Common misconceptions


- **“Ready proves the schema is complete.”** `pg_isready` tests connection status, not required tables. Check schema or the consuming operation.
- **“The init ConfigMap upgrades existing databases.”** Its scripts are first-initialization hooks, not a migration history.
- **“Demo rows returning means recovery worked.”** Seeds can recreate those rows after losing the original volume; passenger bookings remain lost.

## Check yourself

<details>
<summary>After replacing booking-db's volume, tables exist but bookings are empty. Why?</summary>

First-start initialization created the schema. It could not reconstruct passenger bookings, and the booking seed does not contain them.

</details>

<details>
<summary>Does ON CONFLICT DO NOTHING update an existing user's values?</summary>

No. It skips the insert for the specified conflict key. Updating existing data needs an explicit operation.

</details>

## Where this leads

[Recovery boundaries](./recovery-boundaries) distinguishes keeping existing files from restoring data after those files are lost or damaged.

## References

- [Official PostgreSQL image initialization](https://hub.docker.com/_/postgres)
- [PostgreSQL connection readiness checks](https://www.postgresql.org/docs/15/app-pg-isready.html)
- [Kubernetes init containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)
