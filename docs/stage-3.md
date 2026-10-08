---
title: "Stage 3 — Mission Data: Persistent Storage & StatefulSets"
description: "Prove which failures a PVC survives and which it does not, by deleting Pods, claims and nodes' schedulability."
sidebar_label: "Stage 3: Mission Data (Storage)"
---

# Build Stage 3: Mission Data

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Namespace: `apollo-airlines-apps`.
- Needs: Stage 2 Substage 5 (Envoy Gateway + MetalLB) carries over.
- Read the [Mission Data chapters](./learn/storage/volume-lifetimes) first.
- Destructive steps are scoped to `identity-db`, which re-seeds from its init ConfigMap. Do not run them on other databases.
:::

**Skill this lab builds:** given "the data is gone / the DB Pod is stuck", say which layer failed: Pod, claim, volume, node, or seed.

## What changes from Stage 1

| | Stage 1 | Stage 3 |
|---|---|---|
| Controller | Deployment | **StatefulSet** (`identity-db`, `flight-db`, `booking-db`, `redis`) |
| Pod name | random `booking-db-xxxx` | stable ordinal `identity-db-0` |
| Storage | `emptyDir` (dies with Pod) | `volumeClaimTemplates` → PVC `pg-data-identity-db-0` (1Gi, RWO) |
| DNS | one Service | normal `identity-db` **and** headless `identity-db-headless` |
| Schema | Job after start | `/docker-entrypoint-initdb.d` from a ConfigMap, **first start only** |

Chain to memorise: `StatefulSet → volumeClaimTemplate → PVC → PV → StorageClass (local-path) → a directory on one node`.

---

## Exercise 1: Deploy, then find the actual bytes

**Concepts:** [Claims and provisioning](./learn/storage/claims-and-provisioning) · [Volume lifetimes](./learn/storage/volume-lifetimes)

**Goal:** follow the chain from StatefulSet to a directory on a node.
**Time:** ~10 min

1. **Predict:** what is the PVC for `identity-db-0` called? On which node do the Postgres files live?
2. **Do:**

```bash
bash stages/stage3/scripts/apply.sh
kubectl get sts,pods -n apollo-airlines-apps -l tier=data
kubectl get pvc -n apollo-airlines-apps
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='path={.spec.hostPath.path}{"\n"}node={.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]}{"\n"}reclaim={.spec.persistentVolumeReclaimPolicy}{"\n"}'
kubectl get sc
```

3. **Check:**
   - Pods `identity-db-0`, `flight-db-0`, `booking-db-0`, `redis-0`, all `1/1`.
   - PVC `pg-data-identity-db-0` is `Bound`. Name = `<template>-<sts>-<ordinal>`.
   - The PV has a host path under `/var/local-path-provisioner/…`, pinned to **one node** by `nodeAffinity`. `reclaim=Delete`.
   - StorageClass `standard (default)` with provisioner `rancher.io/local-path`.
4. **Open the volume on that node:**

```bash
NODE=<the node printed above>
DIR=<the path printed above>
docker exec $NODE ls $DIR
docker exec $NODE ls $DIR/pgdata | head -5
```

   - You see `pgdata` containing `PG_VERSION`, `base`, `pg_wal`: Postgres' real files, on the node's disk.
5. **Why:**
   - A PVC is a request, the PV is what satisfied it. With `local-path`, "volume" means a plain directory on a single node.
   - That is persistence across **Pod replacement**, not across node loss. No backup, no replication.
6. **Your turn:** `kubectl get pvc -A` shows PVCs for four data workloads. Find which `StorageClass` mode (`volumeBindingMode`) explains why a PVC stays `Pending` until its Pod is scheduled, and verify with `kubectl get sc standard -o jsonpath='{.volumeBindingMode}'`.

<details>
<summary>Answer</summary>

`WaitForFirstConsumer`: binding waits until a Pod using the claim is scheduled, so the volume is created on the node the Pod actually landed on.
</details>

---

## Exercise 2: Build the survival table with real deletes

**Concepts:** [Volume lifetimes](./learn/storage/volume-lifetimes) · [Recovery boundaries](./learn/storage/recovery-boundaries)

**Goal:** replace "it's persistent" with a measured table of what each operation destroys.
**Time:** ~20 min

1. **Predict:** after each operation, is the marker row still there? Fill the table.

| Operation | Marker survives? | Same PV? |
|---|---|---|
| A: delete the Pod | ? | ? |
| B: scale StatefulSet to 0, then 1 | ? | ? |
| C: delete the **StatefulSet**, re-apply it | ? | ? |
| D: delete the **PVC** | ? | ? |

2. **Helpers and marker:**

```bash
NS=apollo-airlines-apps
Q() { kubectl exec -n $NS identity-db-0 -- psql -U postgres -d identity -tAc "$1"; }
PVNAME() { kubectl get pvc pg-data-identity-db-0 -n $NS -o jsonpath='{.spec.volumeName}{"\n"}'; }
Q "INSERT INTO users (id,email,password_hash,first_name,last_name) VALUES ('99999999-9999-4999-8999-999999999999','persisted@apollo.local','h','Persist','Test');"
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"; PVNAME
```

3. **A: delete the Pod**

```bash
kubectl delete pod identity-db-0 -n $NS && kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=90s
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"; PVNAME
kubectl logs -n $NS identity-db-0 | grep -iE "skipping initialization|running /docker-entrypoint-initdb.d"
```

   - Row present, same PV. Logs show `…Skipping initialization`: Postgres found a populated data directory and did **not** rerun the seed.
4. **B: scale to 0 and back**

```bash
kubectl scale sts/identity-db -n $NS --replicas=0 ; kubectl wait --for=delete pod/identity-db-0 -n $NS --timeout=60s
kubectl get pvc pg-data-identity-db-0 -n $NS
kubectl scale sts/identity-db -n $NS --replicas=1 ; kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=90s
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"
```

   - PVC stays `Bound` while no Pod exists. Row present.
5. **C: delete the StatefulSet**

```bash
kubectl delete sts identity-db -n $NS
kubectl get pvc pg-data-identity-db-0 -n $NS                              # still there
kubectl apply -f stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml
kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=90s
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"; PVNAME
```

   - Row present, same PV: **deleting a StatefulSet never deletes its PVCs**.
6. **D: delete the claim (this one loses data)**

```bash
OLD=$(PVNAME); echo "old PV: $OLD"
kubectl delete pvc pg-data-identity-db-0 -n $NS --wait=false
sleep 3; kubectl get pvc pg-data-identity-db-0 -n $NS          # Terminating: pvc-protection
kubectl delete pod identity-db-0 -n $NS
kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=120s
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"
echo "new PV: $(PVNAME)"; kubectl get pv $OLD 2>&1 | tail -1
kubectl logs -n $NS identity-db-0 | grep -iE "skipping initialization|running /docker-entrypoint-initdb.d"
Q "SELECT count(*) FROM users;"
```

   - First the PVC sits in `Terminating` while a Pod still uses it (the `kubernetes.io/pvc-protection` finalizer), and completes when the Pod goes.
   - The StatefulSet controller then creates a **new** PVC; the old PV is deleted (`reclaim=Delete`); the new PV name differs.
   - Marker query returns **no row**. Logs now show `running /docker-entrypoint-initdb.d/init.sql`: a fresh data directory triggered the seed, so the seeded users are back but your marker is not. `count(*)` is the seed count.
7. **Fill in the answers:**

| Operation | Marker survives? | Same PV? |
|---|---|---|
| A delete Pod | yes | yes |
| B scale 0→1 | yes | yes |
| C delete StatefulSet | yes | yes |
| D delete PVC | **no** | **no** (new PV) |

8. **Why:**
   - Data lifetime = **PVC lifetime**, nothing shorter. Pods and StatefulSets come and go.
   - Seed-on-first-start is idempotent and safe, but it also **masks** data loss: the DB looked healthy after D, with seed users present.
   - The only protection against D (and node loss) is a backup you have restored before. Chapter: [Recovery boundaries](./learn/storage/recovery-boundaries).
9. **Your turn:** the reclaim policy is `Delete`. What single field would keep the volume after step D, and what would a person then have to do by hand to reuse it?

<details>
<summary>Answer</summary>

`persistentVolumeReclaimPolicy: Retain` on the PV (or on the StorageClass). After PVC deletion the PV becomes `Released`, data intact, but it cannot bind to a new claim until an administrator clears its `claimRef`.
</details>

---

## Exercise 3: Names that survive vs addresses that do not

**Concepts:** [StatefulSets and headless DNS](./learn/storage/statefulsets-and-headless-dns)

**Goal:** show which of the two DNS names stays correct after the Pod is replaced.
**Time:** ~10 min

1. **Predict:** after deleting `identity-db-0`, which still resolves to the right place: `identity-db` (normal Service), `identity-db-0.identity-db-headless`, or the old Pod IP?
2. **Do (inside the cluster):**

```bash
NS=apollo-airlines-apps
R() { kubectl exec -n $NS deploy/identity -- getent hosts "$@"; }
echo "pod IP      : $(kubectl get pod identity-db-0 -n $NS -o jsonpath='{.status.podIP}')"
R identity-db
R identity-db-0.identity-db-headless
R identity-db-headless
kubectl delete pod identity-db-0 -n $NS && kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=90s
echo "new pod IP  : $(kubectl get pod identity-db-0 -n $NS -o jsonpath='{.status.podIP}')"
R identity-db
R identity-db-0.identity-db-headless
```

3. **Check:**
   - Before: `identity-db` → ClusterIP (`10.96.x.x`). `identity-db-0.identity-db-headless` and `identity-db-headless` → the **Pod IP**.
   - After: the ClusterIP is identical; the headless name returns the **new** Pod IP; the old IP is gone.
4. **Prove the app follows** (readiness through the Gateway):

```bash
curl -s -o /dev/null -w 'identity readyz=%{http_code}\n' -H "Host: identity.apollo.local" http://$(kubectl get gateway apollo-gateway -n $NS -o jsonpath='{.status.addresses[0].value}')/readyz
```

   - `200`: `identity` connects through the ClusterIP Service `identity-db`, so it never needed to know the Pod's IP.
5. **Why:**
   - A normal Service load-balances: right for stateless clients, wrong for "talk to the primary".
   - A headless Service (`clusterIP: None`) publishes per-Pod DNS records: the stable name `<pod>.<headless-svc>` is what replicas, primaries and operators use.
   - Apollo's app uses the normal Service. The headless one exists for identity of `identity-db-0` and future replicas.
6. **Your turn:** scale `identity-db` to 2 (`kubectl scale sts identity-db --replicas=2`). Watch Pod creation order and PVC names, then resolve both pod names. Why is the second DB empty, and why is this *not* a replicated database? Scale back to 1 and delete the leftover PVC `pg-data-identity-db-1`.

<details>
<summary>Answer</summary>

`identity-db-1` starts in order after `-0` is Ready and gets its own PVC `pg-data-identity-db-1`, which was seeded independently by the init script. A StatefulSet gives identity and storage, not replication; Postgres replication must be configured separately (operators do this). Scaling down never deletes PVCs, so delete `pg-data-identity-db-1` by hand.
</details>

---

## Exercise 4: Two Pending claims, one is normal

**Concepts:** [Claims and provisioning](./learn/storage/claims-and-provisioning)

**Goal:** tell a healthy `Pending` PVC from a broken one.
**Time:** ~8 min

1. **Predict:** you create two PVCs: one with the default class, one with `storageClassName: nope`. Both show `Pending`. Which is a problem?
2. **Inject:**

```bash
kubectl apply -n apollo-airlines-apps -f - <<'YAML'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: lab-ok}
spec: {accessModes: [ReadWriteOnce], resources: {requests: {storage: 100Mi}}}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: lab-bad}
spec: {accessModes: [ReadWriteOnce], storageClassName: nope, resources: {requests: {storage: 100Mi}}}
YAML
sleep 5
kubectl get pvc lab-ok lab-bad -n apollo-airlines-apps
kubectl describe pvc lab-ok lab-bad -n apollo-airlines-apps | grep -E '^Name:|Warning|Normal|waiting|not found'
```

3. **Diagnose:**
   - `lab-ok`: event `WaitForFirstConsumer … waiting for first consumer to be created before binding`. Normal.
   - `lab-bad`: `storageclass.storage.k8s.io "nope" not found`. Real fault.
4. **Fix `lab-ok` by giving it a consumer; prove it binds:**

```bash
kubectl apply -n apollo-airlines-apps -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata: {name: lab-writer}
spec:
  containers:
    - {name: w, image: busybox:1.36.1, command: ["sh","-c","echo hello > /data/f; sleep 3600"], volumeMounts: [{name: d, mountPath: /data}]}
  volumes: [{name: d, persistentVolumeClaim: {claimName: lab-ok}}]
YAML
kubectl wait --for=condition=Ready pod/lab-writer -n apollo-airlines-apps --timeout=60s
kubectl get pvc lab-ok -n apollo-airlines-apps
kubectl exec -n apollo-airlines-apps lab-writer -- cat /data/f
```

   - `lab-ok` becomes `Bound`; `hello`.
5. **Fix `lab-bad`:** `storageClassName` is immutable on a PVC, so delete and recreate it without the bad class.
6. **Clean up:** `kubectl delete pod lab-writer -n apollo-airlines-apps; kubectl delete pvc lab-ok lab-bad -n apollo-airlines-apps`.
7. **Why:** `Pending` PVC + `WaitForFirstConsumer` is normal. `Pending` PVC with a `ProvisioningFailed`/`not found` event is a broken class or provisioner. A Pod stuck `Pending` because of a PVC: describe the **PVC** next.
8. **Your turn:** write a PVC that requests `storage: 100Gi` with the default class and mount it from a Pod. Does local-path refuse it? What does that say about how much the "capacity" in a PVC is enforced for local-path?

<details>
<summary>Answer</summary>

local-path generally accepts it: the request is recorded but the directory is not quota-limited. Capacity enforcement depends on the provisioner. Delete the Pod and PVC when done.
</details>

---

## Exercise 5: Break it: the volume pins the Pod to a node

**Concepts:** [StatefulSet storage and operations](./learn/storage/statefulset-storage-and-operations) · [Scheduling](./learn/reliability/scheduling)

**Goal:** show that local-path persistence is also a scheduling constraint.
**Time:** ~8 min

1. **Predict:** you cordon the node that holds `identity-db-0`'s volume and delete the Pod. Where does the replacement go?
2. **Inject:**

```bash
NS=apollo-airlines-apps
NODE=$(kubectl get pod identity-db-0 -n $NS -o jsonpath='{.spec.nodeName}'); echo $NODE
kubectl cordon $NODE
kubectl delete pod identity-db-0 -n $NS
sleep 10
kubectl get pod identity-db-0 -n $NS -o wide
kubectl describe pod identity-db-0 -n $NS | sed -n '/^Events:/,$p'
```

3. **Symptom:** `Pending`, `NODE <none>`. `FailedScheduling` from `default-scheduler`: something like `0/3 nodes are available: 1 node(s) were unschedulable, 1 node(s) had untolerated taint…, 1 node(s) had volume node affinity conflict`.
4. **Diagnose:** Ignition's table: Pending with no node ⇒ scheduler. The message names **volume node affinity**: the PV only exists on `$NODE`, which is cordoned.
5. **Fix and prove:**

```bash
kubectl uncordon $NODE
kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=120s
kubectl get pod identity-db-0 -n $NS -o wide
```

   - Back on the **same** node, data intact.
6. **Why:** with node-local storage, losing or draining that node makes the database unschedulable. Network-attached storage (EBS, Persistent Disk) can be re-attached elsewhere; that is a cloud-stage topic.
7. **Your turn:** `kubectl drain $NODE --ignore-daemonsets --delete-emptydir-data` would do the same in production maintenance. Predict which other workloads move and which Pod stays Pending, then think through why Stage 4's PodDisruptionBudgets exist. (Do not drain unless you can afford a few minutes of disruption; uncordon afterwards.)

---

## Exercise 6: Why the seed is not an init container

**Concepts:** [Initialization and seeding](./learn/storage/initialization-and-seeding)

**Goal:** understand the deadlock the repo avoided, and show first-start-only seeding.
**Time:** ~5 min

1. **Read** the comment block at the top of `stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml`.
2. **Predict:** an init container that waits for `pg_isready -h 127.0.0.1` before the main container starts: what happens?
3. **Answer by reasoning, then verify against the Pod model:** init containers must **finish** before app containers start. The init waits for Postgres, which cannot start until init finishes. Neither progresses.
4. **See the real mechanism:**

```bash
kubectl get sts identity-db -n apollo-airlines-apps -o jsonpath='{.spec.template.spec.volumes[?(@.name=="init-script")]}{"\n"}'
kubectl exec -n apollo-airlines-apps identity-db-0 -- ls /docker-entrypoint-initdb.d
```

   - A ConfigMap mounted at `/docker-entrypoint-initdb.d`. The Postgres image runs it **only when the data directory is empty** (you saw both log lines in Exercise 2).
5. **Your turn:** add a second table to the ConfigMap and re-apply it. Predict whether `identity-db-0` gets the table, then check. What would you have to do to apply a schema change to an existing database?

<details>
<summary>Answer</summary>

It does not appear: the data directory is populated, so init scripts are skipped. Existing databases need a migration (a Job or tool such as a migration runner), not a seed script.
</details>

---

## Clean-up and baseline

```bash
kubectl get sts,pvc -n apollo-airlines-apps
kubectl get nodes     # all Ready, none SchedulingDisabled
kubectl exec -n apollo-airlines-apps identity-db-0 -- psql -U postgres -d identity -tAc "DELETE FROM users WHERE email='persisted@apollo.local'"
bash stages/stage3/scripts/verify.sh
```

## You can now

- [ ] Walk StatefulSet → PVC → PV → node directory with real commands.
- [ ] Say which operations destroy data (PVC delete) and which do not (Pod, scale, StatefulSet delete).
- [ ] Explain the two DNS names and which survives replacement.
- [ ] Tell a healthy `Pending` PVC from a broken one, and read a volume-affinity scheduling failure.

## Checkpoint

1. Why does `identity-db-0` re-attach the same PVC after deletion?
2. After deleting the PVC, why were seeded users present but your marker gone?
3. What does `local-path` not protect against?
4. Why can an init container not wait for the database it is initialising?

Next: [Stage 4: Flight Control](./stage-4).
