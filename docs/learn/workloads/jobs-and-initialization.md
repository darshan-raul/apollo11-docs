---
title: "Jobs and initialization"
description: "Understand why database schema bootstrap and seed work belong in Jobs rather than application containers, and what idempotency means for retries in distributed systems."
---

# Jobs and initialization

*Stage 1 · Liftoff*

The booking service runs two replicas. Both containers start concurrently and both require database tables before serving passenger requests.

If each replica executed database schema migrations as part of its application startup script:
- **Race conditions**: Two processes concurrently execute `CREATE TABLE` statements.
- **Failures and lock contention**: One replica acquires locks while the second crashes or raises duplicate table exceptions.
- **Corrupted state**: Partial migrations left behind by a killed container corrupt production tables.

A **Job** (`batch/v1`) resolves this by decoupling finite initialization tasks from continuous application workloads.

---

## Deployment vs. Job semantics

Kubernetes treats long-running and finite processes with distinct controller semantics:

- **Deployment (`apps/v1`)**:
  - **Purpose**: Runs long-running, resilient web services and daemons.
  - **Reconciliation**: Maintains $N$ replicas indefinitely (`restartPolicy: Always`).
  - **Failure response**: Replaces killed Pods indefinitely until manually updated or deleted.
- **Job (`batch/v1`)**:
  - **Purpose**: Executes a discrete, bounded task to successful completion.
  - **Reconciliation**: Tracks `completions: 1` (`restartPolicy: OnFailure` or `Never`).
  - **Failure response**: Retries up to `backoffLimit: 3` times. If limits are reached, marks the Job `Failed` and halts.

~~~mermaid
flowchart LR
  subgraph Deployment["Deployment: booking (long-running)"]
    D["replicas: 2\nrestartPolicy: Always\nRuns forever until deleted"]
  end
  subgraph Job["Job: init-booking-db (finite work)"]
    J["completions: 1\nbackoffLimit: 3\nrestartPolicy: Never\nRuns until success or limit"]
  end
  Deployment -->|starts booking HTTP server| Booking["booking: serving requests"]
  Job -->|runs psql init.sql| Done["Job: Complete"]
~~~

*Diagram WL-06 — a Deployment maintains a target count forever; a Job drives work to completion and stops.*

---

## Why initialization belongs outside application containers

Embedding schema migrations directly into application startup creates three operational hazards:

- **1. Concurrent race conditions**: Multiple replicas starting simultaneously attempt schema locks concurrently.
- **2. Entangled failure domains**: When a migration fails, the application Pod enters `CrashLoopBackOff`, obscuring whether the root cause is a database schema error, bad environment configuration, or network partition.
- **3. Inability to retry independently**: You cannot re-run only the failed migration without constantly restarting the application web server and causing cascading traffic drops.

Running `init-booking-db` as a standalone Job guarantees the migration completes before the application Deployment is exposed to traffic.

---

## Idempotency: the prerequisite for retries

In distributed environments, operations will inevitably re-execute:
- A network blip occurs mid-migration and the Job retries.
- An operator manually re-runs an initialization Job following a rollback.
- A rolling update triggers automated pre-deploy hooks.

Consequently, all initialization scripts must be strictly **idempotent**:
- **Schema bootstrap**: Always use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- **Seed records**: Always use `INSERT INTO ... ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`.
- **Database readiness polling**: Wrap execution in connection-retry loops so transient database startup delays do not prematurely fail the Job.

---

## The narrow scope of Job completion

A Job marked `Complete` provides very specific evidence:
- **What it proves**: The containerized process completed with exit code `0`.
- **What it does not prove**:
  - That the created schema is compatible with the latest application binary.
  - That subsequent schema changes can be applied without breaking existing data.
  - That existing production records were preserved during column alterations.

---

## Evidence and limits

Diagnose Job failures through the evidence ladder:

- **1. Status check**: Check whether the Job succeeded or exhausted its retry budget:
  ```bash
  kubectl get job init-booking-db -n apollo-airlines
  ```
- **2. Failure events**: Inspect reason and restart counts:
  ```bash
  kubectl describe job init-booking-db -n apollo-airlines | grep -A 10 Events:
  ```
- **3. Job container logs**: Check exact SQL or shell error outputs:
  ```bash
  kubectl logs -n apollo-airlines -l app=init-booking-db
  ```
- **4. Database schema verification**: Directly inspect the database to confirm tables exist:
  ```bash
  kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "\dt"
  ```
