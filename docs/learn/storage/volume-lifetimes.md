---
title: "Volume lifetimes"
description: "Distinguish container restarts from Pod replacement and understand which storage survives each event in Apollo."
---

# Volume lifetimes

*Stage 3 · Mission Data*

**You will be able to:** explain why `emptyDir` loses database files on Pod replacement and state the protection provided by kind's persistent storage.

## The problem

In [Stage 2](../../stage-2), the database Service keeps its name when a database Pod is replaced. The replacement still loses the old rows because the database writes into `emptyDir`, a volume tied to one Pod. Service discovery restores a route to the database; it cannot restore database files.

A container crash can hide this problem. The kubelet can restart the container inside the existing Pod, keeping that Pod's volumes. Replacing the Pod crosses a different storage boundary.

## Ask which event the data survives

A **volume** is storage mounted at a directory path inside a container. The application reads and writes that path using regular filesystem calls without needing to know how Kubernetes supplies the underlying storage. The volume's lifetime determines whether a replacement container or Pod can read the old files.

Keep three events and their physical boundaries separate:

- **Process restart:** a process exits and restarts within the existing container. The container's writable layer and all mounts remain completely untouched.
- **Container restart:** the process crashes or fails a liveness probe. The kubelet preserves the Pod sandbox (its network namespace, cgroups, and local volume directories), discards the container's ephemeral writable layer, starts a new container instance, and re-attaches the Pod's existing mounts. Files in `emptyDir` survive this restart.
- **Pod replacement:** the controller (such as a ReplicaSet or StatefulSet) deletes the old Pod object and schedules a new one. The kubelet on the old node dismantles the entire Pod sandbox and deletes all Pod-scoped directories (including `emptyDir`). The replacement Pod receives a brand-new object UID, and the kubelet initializes a brand-new, empty directory for any `emptyDir` volume.

The Pod's UID uniquely identifies the API object. Even if a replacement Pod is assigned the exact same member name by a StatefulSet, it is a new object with a new UID. The [Pod lifecycle](../cluster/pods) explains that distinction.

## How it works

PostgreSQL writes database files to its configured data directory (`PGDATA`). Whether those files survive across operational events depends on what backs that path:

| Where the files live | Kubelet restarts container | Pod is replaced | Underlying node storage is destroyed |
|---|---|---|---|
| Container writable layer | Files are lost | Files are lost | Files are lost |
| `emptyDir` | Files remain | Files are lost | Files are lost |
| `hostPath`, a directory on a specified node | Files remain | Remain on the original node; placement must be managed | Files are lost |
| kind's local-path persistent volume | Files remain | Replacement reuses the directory on its original node | Files are lost |

A **persistent volume** has a lifetime independent of an individual Pod. That property alone says nothing about copies, backups, or survival of the underlying storage hardware. A remote cloud disk offers different failure protection from a directory on a kind Docker container; the word “persistent” specifies only that the storage outlives the Pod object.

In Stages 1 and 2, every database was a Deployment with an `emptyDir` volume:

```yaml
# Stage 1 and 2 (ephemeral database volume)
volumes:
  - name: pg-data
    emptyDir: {}
```

An `emptyDir` volume is appropriate for scratch files, build caches, or sharing intermediate files between containers in the same Pod. It fails Apollo's database requirement: passengers expect flight bookings to outlive the ephemeral Pod that accepted them.

## Apollo example

Stage 3 mounts persistent storage for each data workload. A **PersistentVolumeClaim (PVC)** is the Kubernetes request through which the Pod obtains that storage.

| Workload | Persistent mount | Claim |
|---|---|---|
| `identity-db` | `/var/lib/postgresql/data` | `pg-data-identity-db-0` |
| `flight-db` | `/var/lib/postgresql/data` | `pg-data-flight-db-0` |
| `booking-db` | `/var/lib/postgresql/data` | `pg-data-booking-db-0` |
| `redis` | `/data` | `redis-data-redis-0` |

In [the identity database manifest](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml), `PGDATA` is configured as `/var/lib/postgresql/data/pgdata`, a subdirectory of the persistent mount. Using a subdirectory keeps the database files isolated and avoids initializing PostgreSQL in a volume root that may contain lost+found or filesystem metadata entries.


On kind, the local-path provisioner creates a directory inside a node container. Replacing `identity-db-0` leaves that directory intact. Losing contact with the node makes the data unavailable; permanently deleting its storage loses the files. Those are different outcomes, and neither is repaired by giving the Pod a new name.

## Try it

After installing Stage 3, inspect the mount without changing the database:

```bash
kubectl get pod identity-db-0 -n apollo-airlines-apps \
  -o jsonpath='{.spec.volumes[?(@.name=="pg-data")].persistentVolumeClaim.claimName}{"\n"}'
```

Expected: `pg-data-identity-db-0`. This proves that the Pod uses a claim for `pg-data`. It does not prove which records are stored there. The [walkthrough](../../stage-3#step-5-see-the-data-survive-a-pod-replacement) shows a distinct row surviving replacement; seed rows alone are weak evidence because setup can recreate them.

## Common misconceptions

- **“The Pod restarted successfully, so storage is durable.”** A container restart can preserve `emptyDir`. Check whether a new Pod object was created before drawing a conclusion.
- **“The Service name is stable, so the database is unchanged.”** A Service selects endpoints. It does not inspect their files.
- **“A persistent volume is a backup.”** It may be the only copy, including any accidental deletions written by the database.

## Check yourself

<details>
<summary>Why can a container restart keep rows that a Pod replacement loses?</summary>

The original Pod's <code>emptyDir</code> survives replacement of a container inside that Pod. A new Pod gets a new, empty volume.

</details>

<details>
<summary>The kind node is temporarily offline. Are its database files necessarily destroyed?</summary>

No. They may still exist on the node's storage but be unavailable. Permanent destruction of that storage is data loss; a PVC cannot recreate those bytes.

</details>

## Where this leads

[Claims and provisioning](./claims-and-provisioning) follows the request from a Pod to the volume that supplies its storage.

## References

- [Kubernetes volumes and container restarts](https://kubernetes.io/docs/concepts/storage/volumes/#why-volumes-are-important)
- [The lifetime of emptyDir](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir)
