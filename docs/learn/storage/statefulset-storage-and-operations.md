---
title: "StatefulSet storage and operations"
description: "Connect each StatefulSet member to its claim and understand updates, claim retention, and Redis persistence."
---

# StatefulSet storage and operations

*Stage 3 · Mission Data*

**You will be able to:** follow a member to its dedicated claim and explain what replacement, updates, and scale-down do to its data.

## The problem

[Stable names](./statefulsets-and-headless-dns) let callers find a replacement member, but the replacement must also mount the correct files. A database returning under the same name with a new empty volume would still have lost its rows.

Once storage outlives the Pod, stopping a workload also stops being the same as removing its storage. Updates and cleanup need separate rules for Pods and claims.

## One claim per member

A **claim template**, `volumeClaimTemplates`, describes storage to create for each StatefulSet member. The controller combines the template name, StatefulSet name, and ordinal to name the claim:

```text
pg-data + identity-db + 0 → pg-data-identity-db-0
```

The Pod's `volumeMounts` entry uses the template name, `pg-data`. The controller connects that volume to the generated claim. Replacing member zero reuses its existing claim instead of allocating a new one.

## How it works

These excerpts come from [Apollo's identity StatefulSet](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml). They occupy different parts of the manifest:

```yaml
# Under spec.template.spec.containers[0]
volumeMounts:
  - name: pg-data
    mountPath: /var/lib/postgresql/data
```

```yaml
# Under spec
volumeClaimTemplates:
  - metadata:
      name: pg-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
```

The matching `name` links the container mount to the claim template. Each of Apollo's three PostgreSQL StatefulSets uses `pg-data`; Redis uses `redis-data` mounted at `/data`.

### Replacement and updates

Apollo relies on the default `OrderedReady` Pod management policy and `RollingUpdate` update strategy:

- **Multi-member StatefulSets:** Scale-up creates members sequentially from lowest ordinal (`0` then `1`), waiting for each to become `Ready`. Rolling updates proceed in reverse order: the highest ordinal is terminated, updated, and verified `Ready` before the next lower ordinal is updated.
- **Apollo's single-member databases:** Because `replicas: 1`, a rolling update must terminate the only database member (`identity-db-0`) before creating its replacement. Persistent storage preserves the database files across this rollout, but the database is completely offline during the restart interval. Application clients must implement connection retry logic to tolerate this downtime.

Readiness probes report only what their check tests. Apollo's PostgreSQL probe runs `pg_isready`, which verifies that the server process is accepting TCP connections. It does not verify that tables exist, data is intact, or queries succeed.

### Claim retention and volume reclamation

It is easy to confuse **claim retention** with **volume reclamation**. They apply at different layers and answer different questions:

1. **Claim retention policy (`spec.persistentVolumeClaimRetentionPolicy` on StatefulSet):** Governs whether the StatefulSet controller deletes generated PVCs when members are scaled down or the StatefulSet is deleted. It provides two controls:
   - `whenScaled`: What happens to claims when `replicas` is decreased (default: `Retain`).
   - `whenDeleted`: What happens to claims when the StatefulSet object is deleted (default: `Retain`).
   Apollo leaves this policy at the Kubernetes default (`Retain`), so neither scaling down nor deleting the StatefulSet deletes the PVCs.
2. **Volume reclaim policy (`spec.persistentVolumeReclaimPolicy` on PV):** Governs what happens to the underlying storage hardware or node directory when a PVC is explicitly deleted.
   - `Delete`: The storage provisioner automatically deletes the backing directory or disk volume and removes the PV object.
   - `Retain`: The PV status changes to `Released`. The underlying storage remains intact on disk, but the PV cannot be reused by a new claim until an administrator manually cleans and rebinds it.

| Operation in Apollo | Claim status | Storage consequence |
|---|---|---|
| Replace member `0` (`kubectl delete pod`) | Retained and reused | Replacement Pod `identity-db-0` remounts the exact same PV |
| Scale StatefulSet to zero | Retained | PVC remains `Bound`; data rests on node disk without a running process |
| Delete the StatefulSet object | Retained by default | Claims remain; reapplying the StatefulSet rebinds members to existing claims |
| Explicitly delete the PVC (`kubectl delete pvc`) | Deleted after Pod exits | PV reclaim policy `Delete` triggers provisioner to remove the node directory |
| Delete the application namespace | Claims deleted | All PVCs deleted, triggering deletion of backing storage |

Neither retention nor reclamation provides a backup. [Recovery boundaries](./recovery-boundaries) covers their failure limits.

## Apollo example: Redis must write its state

Mounting a persistent volume does not automatically make an application persist data: the application must explicitly write its state to the mounted directory.

PostgreSQL is a relational database designed around disk storage; committed transactions are synchronously flushed to its write-ahead log (WAL) on the `/var/lib/postgresql/data` volume before acknowledging the client.

Redis, however, is an in-memory data store by default. If you attach a PVC to an unconfigured Redis container, Redis keeps all keys in RAM and never writes them to disk. Upon Pod replacement, the new Redis process starts with completely empty memory!

To ensure state survives Pod replacement, Apollo explicitly configures persistence in [redis-sts.yaml](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/redis/redis-sts.yaml):

```yaml
command:
  - redis-server
  - --appendonly yes
  - --appendfsync everysec
  - --save 60 100
```

How Redis handles persistence:
- **Append-Only File (AOF):** `--appendonly yes` writes every write command received by Redis to `/data/appendonly.aof`. When the Pod is replaced, Redis replays this log to reconstruct its memory state.
- **Flush policy:** `--appendfsync everysec` tells Redis to flush the AOF write buffer to disk once per second in a background thread. This balances high throughput against durability: if the container or node suffers an abrupt crash, up to ~1 second of recently acknowledged writes can be lost.
- **RDB snapshots:** `--save 60 100` creates a point-in-time binary snapshot (`dump.rdb`) if at least 100 keys change within 60 seconds. When both AOF and RDB are present, Redis loads AOF because its dataset is more complete.


## Try it

After installing Stage 3:

```bash
kubectl get pod identity-db-0 -n apollo-airlines-apps \
  -o jsonpath='{.spec.volumes[?(@.name=="pg-data")].persistentVolumeClaim.claimName}{"\n"}'
kubectl exec -n apollo-airlines-apps redis-0 -- redis-cli config get appendonly
kubectl exec -n apollo-airlines-apps redis-0 -- redis-cli config get appendfsync
```

Expected: `pg-data-identity-db-0`, then Redis settings `appendonly` / `yes` and `appendfsync` / `everysec`. This confirms the storage association and live persistence settings; it does not test crash recovery.

## Common misconceptions

- **“Deleting the StatefulSet always deletes its data.”** Apollo's default retention keeps claims. A configured deletion policy could change this.
- **“Scaling a database adds replicated capacity.”** Apollo would create independent databases; scaling requires database-aware design.
- **“A Redis PVC preserves every acknowledged write.”** The application must persist writes, and `everysec` permits a crash-loss window.

## Check yourself

<details>
<summary>What survives scaling identity-db to zero and back to one?</summary>

Under Apollo's default retention, <code>pg-data-identity-db-0</code> remains and member zero reuses it. The service is unavailable while no database Pod is running.

</details>

<details>
<summary>Which policy determines storage deletion after a PVC is removed?</summary>

The PV's reclaim policy. StatefulSet claim retention determines whether certain controller operations delete the PVC in the first place.

</details>

## Where this leads

[Initialization and seeding](./initialization-and-seeding) explains how PostgreSQL treats a genuinely fresh volume differently from one containing an existing database.

## References

- [StatefulSet storage and retention](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Redis persistence settings](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
