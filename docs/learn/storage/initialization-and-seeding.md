---
title: "Initialization and seeding"
description: "Distinguish schema bootstrap, seed data, and migrations as separate kinds of database work with different retry policies, idempotency requirements, and evidence standards."
---

# Initialization and seeding

*Stage 3 · Mission Data*

A blank database engine cannot serve application traffic without initialization. In Kubernetes environments, operations teams frequently group all database preparation under "startup scripts." 

In practice, database lifecycle tasks fall into three fundamentally distinct operations:

---

## The three types of database tasks

~~~mermaid
flowchart TD
  subgraph Bootstrap["1. Schema bootstrap"]
    B["CREATE TABLE IF NOT EXISTS bookings ...\nCREATE INDEX IF NOT EXISTS ...\nIdempotent by design\nRun once per new database\nSafe to retry"]
  end
  subgraph Seed["2. Seed data"]
    S["INSERT INTO airports VALUES (...)\nON CONFLICT DO NOTHING\nIdempotent if using conflict clauses\nDevelopment / test only\nNot for production state"]
  end
  subgraph Migration["3. Schema migration"]
    M["ALTER TABLE bookings ADD COLUMN ...\nNot always safely repeatable\nRequires versioning\nRequires backward-compatible rollout\nProduction-critical risk"]
  end
  Bootstrap -->|prerequisite for| Seed
  Bootstrap -->|prerequisite for| Migration
~~~

*Diagram ST-05 — bootstrap, seed, and migration are distinct operations with different risk profiles and retry requirements.*

- **1. Schema bootstrap**:
  - **Purpose**: Creates empty initial tables, constraints, and indices.
  - **Retry contract**: Must be strictly idempotent (`CREATE TABLE IF NOT EXISTS`).
  - **Execution**: Runs once when creating a fresh database cluster.
- **2. Seed data**:
  - **Purpose**: Populates fixed baseline reference data (airport IATA codes, flight schedules, test accounts).
  - **Retry contract**: Idempotent via conflict resolution (`INSERT ... ON CONFLICT DO NOTHING`).
  - **Execution**: Common in local, staging, and automated QA environments.
- **3. Schema migrations**:
  - **Purpose**: Alters existing schemas, transforms data types, and updates live production columns.
  - **Retry contract**: High risk; requires explicit migration tracking tables (e.g. Flyway, Liquibase) and strict backwards compatibility.

---

## Container lifecycle hook: `docker-entrypoint-initdb.d`

In Stage 3, Apollo mounts initialization SQL scripts directly into the database container's `/docker-entrypoint-initdb.d/` directory:

- **When it executes**: Runs **only on first boot** when the PostgreSQL data directory is completely empty.
- **Why it is safe**: Once the PVC has initialized data files, subsequent container restarts bypass the initialization directory entirely, avoiding duplicate run conflicts.
- **Limitation**: If a script partially fails on the first run, the database directory is marked initialized, and subsequent boots will skip the script. Manual intervention is required to repair partial states.

---

## Evidence and limits

- **1. Entrypoint execution logs**: Inspect container bootstrap logs:
  ```bash
  kubectl logs -n apollo-airlines-apps -l app=identity-db | grep "initdb"
  ```
- **2. Schema verification**: Confirm created tables:
  ```bash
  kubectl exec -n apollo-airlines-apps statefulset/identity-db -- \
    psql -U postgres -d identity -c "\dt"
  ```
- **3. Seed row count**: Verify seed data was inserted:
  ```bash
  kubectl exec -n apollo-airlines-apps statefulset/identity-db -- \
    psql -U postgres -d identity -c "SELECT count(*) FROM users;"
  ```
