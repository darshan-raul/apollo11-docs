---
title: "Recovery boundaries"
description: "Understand claim deletion, node loss, and bad writes, then inspect recovery by restoring a logical backup into a separate database."
---

# Recovery boundaries

*Stage 3 · Mission Data*

**You will be able to:** distinguish persistence, availability, and backup, predict deletion consequences, and describe what a restore test proves.

## The problem

A row surviving database Pod replacement proves that the replacement reopened the existing data. It does not prove recovery after a lost volume, a destroyed node, or an accidental SQL deletion. Each event requires protection beyond the successful Pod replacement.

[Initialization and seeding](./initialization-and-seeding) also showed why a working application can mislead: new tables and demo rows can appear after total data loss. Recovery must check data that matters, such as a booking created before the failure.

## Each recovery claim needs its own test

Engineers often say a system has "persistent storage" and assume it is safe from disaster. In production engineering, you must distinguish four separate operational concerns:

| Concern | Scope | Mechanism | What failure it survives |
|---|---|---|---|
| **Persistence** | Data directory | Dedicated PV / PVC | Container crash, Pod deletion, node reboot |
| **Availability** | Network service | Multiple replicas, health probes, failover | Member crash, single instance upgrade downtime |
| **Replication** | Multi-node state | Streaming WAL, consensus (Raft/Paxos) | Physical host or availability zone hardware loss |
| **Backup** | Point-in-time copy | Independent off-cluster dump or snapshot | Accidental `DROP TABLE`, corruption, catastrophic cluster loss |

Replication improves availability during hardware failure, but it immediately replicates accidental deletions or corrupted writes across all replicas. A backup is the only defense against human error or data corruption, but only if the copy was taken before the corruption, was copied outside the failure domain, and can be successfully restored.

Two metrics define your disaster recovery contract:
- **Recovery Point Objective (RPO):** The maximum age of data that can be lost when unexpected disaster strikes. If database dumps are taken nightly at midnight and the disk fails at 23:00, the system loses 23 hours of business records (an RPO of 24 hours). For Redis with `--appendfsync everysec`, the crash RPO is approximately one second.
- **Recovery Time Objective (RTO):** The maximum allowable duration to restore normal operation. If replaying a backup and testing application connectivity takes two hours, the RTO is two hours.

## How it works: deletion policies and failure domains

Apollo's StatefulSets retain claims on scale-down and StatefulSet deletion by default. Once a claim itself is deleted, the PV's **reclaim policy** determines what happens to the underlying storage:

| Reclaim policy | After claim deletion |
|---|---|
| `Delete` | The provisioner removes the volume and backing storage |
| `Retain` | Storage remains for an administrator to recover and rebind |

kind uses `Delete`. `Retain` prevents automatic reclamation; it does not protect against node destruction or bad database writes.

| Failure or event in Apollo | Consequence | Survives? |
|---|---|---|
| Delete a database Pod (`identity-db-0`) | Controller replaces the Pod; rebinds to same PVC | ✅ Yes (same node) |
| Scale StatefulSet to zero | Claims retained by controller; data rests on disk | ✅ Yes |
| Delete the StatefulSet object | Default retention retains PVCs; reapplying rebinds | ✅ Yes |
| Delete an in-use PVC | `pvc-protection` finalizer delays deletion until Pod exits; then provisioner removes files | ❌ No |
| Delete the application namespace | All PVCs deleted, triggering provisioner `Delete` | ❌ No |
| Temporarily reboot the node | Database is unavailable until node returns; reattaches | ✅ Yes |
| Permanently destroy kind worker container | Local node directory destroyed; PV cannot attach | ❌ No |
| Run accidental SQL `DROP TABLE bookings;` | Change is written to WAL and disk immediately | ❌ No (PVC persists the deletion) |

Do not delete a PV directly as a cleanup shortcut. Storage protection finalizers (`kubernetes.io/pv-protection`) and provisioner hooks will delay removal, and manual PV deletion bypasses controlled recovery procedures.

## Apollo example: what the verifier proves

[Stage 3's verifier](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/scripts/verify.sh) executes this test:
1. Logs in as a passenger through the Envoy Gateway.
2. Creates a booking for an upcoming flight.
3. Deletes `booking-db-0` using `kubectl delete pod`.
4. Waits for `booking-db-0` to report `Ready`.
5. Queries the PostgreSQL database directly for the exact created booking ID.

**What this proves:** It proves that Kubernetes StatefulSets and local-path PVCs successfully re-mounted the existing node directory to the replacement Pod, and that PostgreSQL read its committed transaction from that volume on the same node.

**What this does NOT prove:** It does not prove that Apollo can survive worker node failure, cluster destruction, volume deletion, disk corruption, or accidental SQL drops. Stage 3 provides single-instance persistence, not disaster recovery.


The snapshot contains no automated backup schedule. Cloud disks can improve node-failure handling, but their deletion policies, location, and backup arrangement still determine recovery boundaries.

## Try it: restore into a separate database

A **logical backup** exports database structure and rows using `pg_dump`. Restore compatibility depends on PostgreSQL versions, extensions, and roles; use the same server here to keep the example focused.

:::caution[Unverified]
This optional recipe has been checked against PostgreSQL 15 command documentation, but has not been run on a live Apollo cluster in this documentation revision. It requires a running Stage 3. It creates a temporary database and leaves the application database intact.
:::

Run the following in Bash. A temporary local directory holds the dump, so an unsuccessful export cannot overwrite an earlier backup. Each step runs only if its prerequisite succeeds:

```bash
(
  set -euo pipefail
  BACKUP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/apollo-identity-backup.XXXXXX")
  printf 'Backup directory: %s\n' "$BACKUP_DIR"
  kubectl exec -n apollo-airlines-apps identity-db-0 -- \
    pg_dump -U postgres -d identity --no-owner --no-privileges \
    > "$BACKUP_DIR/identity.sql"
  test -s "$BACKUP_DIR/identity.sql"

  # Fails safely if this database already exists; do not drop an unknown database.
  kubectl exec -n apollo-airlines-apps identity-db-0 -- \
    createdb -U postgres identity_restore_check
  kubectl exec -i -n apollo-airlines-apps identity-db-0 -- \
    psql -U postgres -d identity_restore_check -v ON_ERROR_STOP=1 \
    --single-transaction < "$BACKUP_DIR/identity.sql"
  kubectl exec -n apollo-airlines-apps identity-db-0 -- \
    psql -U postgres -d identity_restore_check \
    -c 'SELECT id, email FROM users ORDER BY email;'
)
```

Expected: the restored database contains the source database's users as of the dump. Compare IDs and emails with the source; do not assume there are exactly two rows if you have added users. Remove the temporary database after inspection:

```bash
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  dropdb -U postgres identity_restore_check
```

The dump remains at the printed local path. It contains account data; keep or remove it deliberately. This rehearsal proves that this dump restores on this server. Both databases still share one node, so it does not test node-loss recovery or application reconnection. A full recovery test restores on independent infrastructure and validates the application against known records.

## Common misconceptions

- **“A successful dump command guarantees recovery.”** A restore also depends on readable storage, permissions, compatibility, and complete data.
- **“Retain is a backup.”** It keeps the same copy, including corruption or mistaken changes.
- **“Seeds recover bookings.”** Apollo's seeds recreate demo data; they contain no passenger booking history.

## Check yourself

<details>
<summary>Does a backup on the database node protect against destruction of that node?</summary>

No. One storage failure can remove both copies. Keep the backup outside the failure boundary you need it to survive.

</details>

<details>
<summary>What is missing after successfully restoring identity into a second database?</summary>

A backup schedule, independent storage and retention, monitoring, measured recovery time and data loss, and a test that the application works against restored records.

</details>

## Where this leads

Use the [Stage 3 walkthrough](../../stage-3) to follow the running storage mechanism. [Stage 4](../../stage-4) then covers probes, shutdown, scheduling, and disruption; none of those replaces a backup.

## References

- [PersistentVolume reclamation and protection](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#reclaiming)
- [PostgreSQL 15 SQL dump and restore](https://www.postgresql.org/docs/15/backup-dump.html)
- [psql error handling and transactions](https://www.postgresql.org/docs/15/app-psql.html)
