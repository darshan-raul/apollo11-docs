---
title: "Volume lifetimes"
description: "Which failure each kind of storage survives, what 'persistent' means on kind, and how to prove a survival claim with an experiment."
---

# Volume lifetimes

*Stage 3 · Mission Data*

**You will be able to:** name the failure boundary a volume crosses instead of calling it "persistent", explain what kind's `local-path` storage does and does not protect, find the real directory behind a claim, and design a test that proves a specific survival claim.

## The problem

In Stage 1 you watched a database Pod be replaced and come back empty. The Deployment did its job, replacing the Pod, but the data lived inside the Pod's own storage and left with it. We need storage whose lifetime is *not* the Pod's.

"Persistent" is the word everyone reaches for, but it hides the real question: persistent **through what**? A Pod restart? A deleted Pod? A dead node? A lost cluster? Each is a different boundary, and different storage crosses different boundaries.

There is a second, quieter problem. Stages 1 and 2 *looked* fine. The application worked, the login worked, bookings worked. The data loss only appeared when a Pod was replaced. Storage failures are invisible until the specific event they cannot survive, so the only honest way to claim durability is to cause that event and look.

## The idea in plain words

Picture places to keep a document: your desk (gone when you leave), a locker (stays while you work here), the office filing cabinet (stays if you change desks), a bank vault in another city (survives the building burning down). Nothing is "safe"; each survives certain events.

Kubernetes storage works the same way, so for any data ask: **which event can happen without these bytes disappearing?**

## How it works: where bytes can live

Before the table, five places a running container can put data, from shortest-lived to longest:

1. **Process memory.** Gone when the process exits. Redis without persistence keeps its data here.
2. **The container's writable layer.** A thin layer on top of the image. It survives the container *process* restarting inside the same container, but a new container starts from the clean image.
3. **`emptyDir`.** A directory created when the Pod is scheduled to a node and deleted when the Pod leaves it. It is shared by all containers in the Pod, so it survives a container crash, but not the Pod's removal.
4. **`hostPath`.** A directory on the node itself, named in the Pod spec. It outlives the Pod but ties data to a particular node.
5. **A PersistentVolumeClaim.** A request for storage owned by something other than the Pod. What it survives is decided by the volume behind it.

## How it works: the survival table

Read it row by row: choose the storage and see which events it crosses.

| Storage | Container restart | Pod deleted | Node lost | Cluster lost |
|---|---|---|---|---|
| Process memory | ❌ | ❌ | ❌ | ❌ |
| Container writable layer | ✅ | ❌ | ❌ | ❌ |
| `emptyDir` | ✅ | ❌ | ❌ | ❌ |
| `hostPath` | ✅ | ✅ same node | ❌ | ❌ |
| PVC, `local-path` (kind) | ✅ | ✅ | ❌ | ❌ |
| PVC, cloud block disk | ✅ | ✅ | ✅ same zone | ❌ |
| Managed DB, multi-AZ | ✅ | ✅ | ✅ | ✅ within region |

Two cells deserve a second look. A **container restart** and a **Pod deletion** are different events: Kubernetes restarts a crashed container inside the same Pod (the Pod and its `emptyDir` stay), but a rolling update, an eviction or `kubectl delete pod` creates a brand-new Pod. And "Cluster lost" is ❌ for every PVC row, because a PVC is a Kubernetes object, so it needs a backup that lives *outside* the cluster. The [Recovery boundaries](./recovery-boundaries) chapter picks that up.

Stage 1 lost its rows because Postgres wrote to an `emptyDir`: a scratch folder tied to the Pod's lifetime. It is the right tool for temporary files, in-memory scratch (`medium: Memory`), or sharing files between containers in one Pod, and the wrong tool for a database.

A **PersistentVolumeClaim (PVC)** is how a Pod asks for storage whose lifetime is separate from the Pod's. The next chapter explains the machinery.

## What Apollo actually changed in Stage 3

*Source: `stages/stage3/README.md` and `stages/stage3/k8s/apps/`*

Four workloads hold state, and Stage 3 moves every one from `Deployment` + `emptyDir` to `StatefulSet` + a 1 GiB `ReadWriteOnce` claim:

| Workload | Holds | Mount path | Claim name |
|---|---|---|---|
| `identity-db` | Users and credentials | `/var/lib/postgresql/data` | `pg-data-identity-db-0` |
| `flight-db` | Airports and flights | `/var/lib/postgresql/data` | `pg-data-flight-db-0` |
| `booking-db` | Bookings | `/var/lib/postgresql/data` | `pg-data-booking-db-0` |
| `redis` | Notification queue | `/data` | `redis-data-redis-0` |

The application Deployments (identity, flight, booking, search, notification, frontend) are untouched. They still connect to `identity-db:5432` and the rest. The app does not know or care that the database underneath gained a durable disk. That is the benefit of putting state behind a Service name.

One line in each Postgres StatefulSet is easy to miss and matters a great deal:

```yaml
- name: PGDATA
  value: /var/lib/postgresql/data/pgdata
```

A new volume formatted by the node often contains a `lost+found` directory at its root. Postgres refuses to initialise a data directory that is not empty, so Apollo points `PGDATA` at a *subdirectory* of the mount. Without it, a perfectly good claim could still make the database crash on first start.

## What `local-path` on kind really is

Apollo's kind cluster has a default StorageClass named `standard`, served by the `rancher.io/local-path` provisioner. It solves one problem and leaves others open:

- **Solves:** the PVC survives Pod replacement. The new Pod remounts the same directory, so the database files are still there.
- **Does not solve:** the directory is a plain folder inside **one** node container (`/var/local-path-provisioner/…`). Lose that node and the data goes with it. It also *pins* the Pod to that node, because only that node has the folder.

So Stage 3 proves survival across **Pod replacement**, and only that. That is a smaller claim than "persistent", and a much more accurate one.

The pinning has a visible consequence. The PV carries a node affinity, so if the node holding it is cordoned or down, the replacement Pod stays `Pending` rather than starting elsewhere with an empty disk. That is the system protecting you from a quiet data-loss mistake, and it is an easy failure to misread as a scheduling bug.

## How to prove a survival claim

A claim you have not tried to break is an assumption. The pattern is always the same: write something distinctive, cause exactly one event, look through the application's own interface.

Stage 3's `verify.sh` does this for the Pod-replacement boundary:

1. Log in as the passenger and create a booking through the public API.
2. `kubectl delete pod booking-db-0`, and wait for the replacement to be Ready.
3. `SELECT id FROM bookings WHERE id='<that booking>'` inside the new Pod.
4. Pass only if the same ID comes back. Then cancel the booking so the test leaves nothing behind.

Notice what it does **not** do. It does not check that the PVC says `Bound` (a label, not proof of contents), and it does not rely on the seed rows (which would be reloaded even from an empty database; see [Initialization and seeding](./initialization-and-seeding)). It uses a row that only exists because this test created it.

## Try it

```bash
kubectl get pvc -n apollo-airlines-apps
kubectl get sc
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='{.spec.hostPath.path}{.spec.local.path}{"\n"}'
kubectl get pv $PV -o jsonpath='{.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]}{"\n"}'
```

- You will see the claim, the storage class, the real directory on the node, and the node the volume is pinned to. One of `hostPath` and `local` prints a path, depending on the provisioner version.

Now look at the bytes yourself, from inside the node:

```bash
NODE=$(kubectl get pod identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.nodeName}')
docker exec "$NODE" ls /var/local-path-provisioner
```

- Each directory name contains the PV name and the claim's namespace and name. This is what "persistent volume" means on kind: a folder.

## Try breaking it

Predict first: does the data survive replacing the Pod?

```bash
kubectl delete pod identity-db-0 -n apollo-airlines-apps
kubectl wait --for=condition=Ready pod/identity-db-0 -n apollo-airlines-apps --timeout=90s
kubectl exec -n apollo-airlines-apps identity-db-0 -- psql -U postgres -d identity -tAc 'SELECT count(*) FROM users'
```

The count is unchanged: the new `identity-db-0` remounts `pg-data-identity-db-0`. Deleting the *claim* instead of the Pod is a different boundary and destroys data, so it is covered in [Recovery boundaries](./recovery-boundaries), where it can be done with a plan.

## Common misconceptions

- **"Bound means backed up."** It means the claim has a volume. Nothing is copied anywhere.
- **"Persistent storage survives anything."** See the table.
- **"`emptyDir` is fine for a database because the Pod restarted fine."** A *restart* keeps it; a *replacement* deletes it.
- **"The data is in the PVC object."** A PVC is a small record in etcd. The bytes are in the volume it points at.
- **"If the app works, the storage works."** Stages 1 and 2 worked until a Pod was replaced.
- **"A bigger requested size means more protection."** Size is capacity, not durability.

## Check yourself

<details>
<summary>Which storage survives Pod deletion but not node loss?</summary>

`hostPath` (same node) and kind's `local-path` PVC.
</details>

<details>
<summary>Why is <code>emptyDir</code> wrong for a Postgres data directory?</summary>

Its lifetime is the Pod's. A replacement Pod starts with an empty data directory.
</details>

<details>
<summary>A cloud PVC survives node loss. Does it survive someone running <code>DROP TABLE users</code>?</summary>

No. The volume faithfully keeps whatever the database wrote, including the mistake. That boundary needs a point-in-time backup.
</details>

<details>
<summary>Why does Apollo set <code>PGDATA</code> to a subdirectory of the mount?</summary>

A freshly formatted volume can contain a <code>lost+found</code> directory at its root, and Postgres refuses to initialise a non-empty data directory. A subdirectory is empty, so first start succeeds.
</details>

<details>
<summary><code>identity-db-0</code> is <code>Pending</code> after its node was cordoned. Why does Kubernetes not just start it on another node?</summary>

The <code>local-path</code> volume exists only on the original node and the PV has node affinity to it. Starting elsewhere would mean an empty disk, so the scheduler keeps the Pod waiting.
</details>

## Where this leads

Next: how a Pod actually asks for durable storage, and how the cluster supplies it.

## References

- [Volumes](https://kubernetes.io/docs/concepts/storage/volumes/) · [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) · [`emptyDir`](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir) · [Rancher local-path-provisioner](https://github.com/rancher/local-path-provisioner)
