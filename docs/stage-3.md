---
title: "Stage 3 — Mission Data: Persistent Storage & StatefulSets"
description: "Move Apollo's three Postgres databases and Redis from Deployments with emptyDir to StatefulSets with PersistentVolumeClaims, split schema from seed data, and understand exactly which failures the data now survives."
sidebar_label: "Stage 3: Mission Data (Storage)"
---

# Stage 3: Mission Data

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage3`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: the `kind-apollo11` cluster from [Ignition](./ignition) and the namespaces and edge from [Stage 2](./stage-2) (Envoy Gateway on MetalLB). Namespaces: `apollo-airlines-apps`, `apollo-airlines-ui`.
- Concepts behind this stage: [Volume lifetimes](./learn/storage/volume-lifetimes) · [Claims and provisioning](./learn/storage/claims-and-provisioning) · [StatefulSets and headless DNS](./learn/storage/statefulsets-and-headless-dns) · [StatefulSet storage and operations](./learn/storage/statefulset-storage-and-operations) · [Initialization and seeding](./learn/storage/initialization-and-seeding) · [Recovery boundaries](./learn/storage/recovery-boundaries)
:::

## Where we left off

- **Stage 2** gave Apollo a real front door: one Gateway IP, hostnames, TLS, and two namespaces.
- But the data layer is still Stage 1's:
  - **Data dies with the Pod.** `identity-db`, `flight-db`, `booking-db` and `redis` are Deployments with `emptyDir`. Delete `booking-db`'s Pod and every booking is gone. The ReplicaSet brings back a Pod, not the data.
  - **Seeding is tied to cluster creation.** The `init-*-db` Jobs ran `init.sql` (schema *and* data) once, after the database started. A replacement database Pod starts empty and nothing seeds it again.
  - **Database Pods have random names** (`booking-db-7d9f…`). Nothing can say "the first identity database" and mean the same Pod tomorrow.
- **Launchpad** didn't have this problem: a Compose named volume outlived its container. Stage 3 gets that back, the Kubernetes way.

## What changes in this stage

| Concern | Stage 2 | Stage 3 | Why it's better |
|---|---|---|---|
| Controller for databases and Redis | Deployment (random Pod names) | **StatefulSet** (`identity-db-0`, `flight-db-0`, `booking-db-0`, `redis-0`) | A stable name that keeps the same storage across replacements |
| Storage | `emptyDir` (lives and dies with the Pod) | **`volumeClaimTemplates`** → one 1Gi `ReadWriteOnce` PVC per Pod | Data lifetime follows the claim, not the Pod |
| Who provides the disk | Nothing | The cluster's **default StorageClass** (kind: `rancher.io/local-path`) | Volumes are created on demand; no PV written by hand |
| DNS for databases | One ClusterIP Service | The same ClusterIP Service **plus a headless Service** (`<db>-headless`) | Each Pod also gets its own DNS name |
| Schema | Inside the `init-*-db` Job | **ConfigMap at `/docker-entrypoint-initdb.d`**, run by Postgres on first start only | Every fresh volume gets the schema, with no Job and no ordering |
| Seed data | Same Job as the schema | **Separate `seed-*-db` Jobs**, `ON CONFLICT DO NOTHING` | Data load is a re-runnable one-shot, separate from the structure |
| Redis | `emptyDir`, no persistence | StatefulSet, PVC at `/data`, **AOF on** (`--appendonly yes`) | Queued notifications survive a restart |
| Edge | Envoy Gateway + MetalLB (substage 5) | **Same files**, in `k8s/gateway/` and `k8s/metallb/` | Nothing to relearn; Traefik and the substages are gone |
| App Deployments | Read values via `configMapKeyRef` | Values inline (`DATABASE_URL`, ports, URLs); ConfigMap trimmed | Same values; app code unchanged |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `k8s/config/` | Two namespaces (now labelled), ConfigMaps, Secrets, 13 ServiceAccounts | Same as Stage 2 |
| `k8s/apps/<db>/<db>-sts.yaml` | StatefulSet for each Postgres DB and Redis | Replaces `k8s/infra/<db>/<db>-dep.yaml` |
| `k8s/apps/<db>/<db>-svc.yaml` | ClusterIP Service the apps use (`identity-db`, …) | Same as Stage 2 |
| `k8s/apps/<db>/<db>-svc-headless.yaml` | Headless Service (`clusterIP: None`) | New |
| `k8s/apps/<db>/<db>-init-script.yaml` | Schema SQL in a ConfigMap, mounted into Postgres | Replaces the schema half of `k8s/jobs/*-init-configmap.yaml` |
| `k8s/jobs/seed-*-db.yaml` + `*-db-seed.yaml` | Seed Jobs and their SQL ConfigMaps | Replaces `init-*-db` Jobs |
| `k8s/apps/<service>/` | The six app Deployments and Services | Same as Stage 2 (values inlined) |
| `k8s/gateway/`, `k8s/metallb/` | Envoy Gateway and MetalLB | Copied from Stage 2 substages 4–5 |
| `scripts/apply.sh` | Seven phases: config → apps and StatefulSets → wait → seed → MetalLB → Envoy Gateway → routes | Replaces Stage 2's `--substage` script |
| `scripts/generate-certs.sh`, `verify.sh`, `verify-tls.sh`, `teardown.sh` | Certificate, checks, clean removal | Moved out of the Traefik folder |

## Walkthrough

### Step 1: Replace Stage 2 and apply

```bash
kubectl config current-context                # must be kind-apollo11
bash stages/stage2/scripts/teardown.sh        # Stage 3 is a snapshot, not a patch
bash stages/stage3/scripts/apply.sh           # add --skip-build to reuse loaded images
```

[`apply.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/scripts/apply.sh) runs seven phases:

1. Namespaces, config, Secrets, ServiceAccounts.
2. Everything under `k8s/apps/`: four StatefulSets, their Services and schema ConfigMaps, and the six app Deployments.
3. Wait for each StatefulSet and its `-0` Pod to be Ready, then for the app Deployments.
4. Run the three `seed-*-db` Jobs and wait for `Complete`.
5. MetalLB and its IP pool.
6. Envoy Gateway (server-side apply).
7. GatewayClass, EnvoyProxy, the TLS Secret if missing, Gateway, ReferenceGrant, six HTTPRoutes. Then wait for `Programmed`.

- **Why tear down Stage 2:** its `identity-db` Deployment and the new `identity-db` StatefulSet would both carry `app: identity-db`. The `identity-db` Service would send traffic to both an empty-dir database and the persistent one.
- **Why the order:** the Postgres entrypoint creates the schema while the Pod starts. Its readiness probe (`pg_isready`) only passes after that. The script waits for Ready, so the seed Jobs never write into a database without tables.
- **Compared with Stage 2:** the edge isn't "kept running" from Stage 2; this stage installs the same MetalLB and Envoy Gateway files again. The frontend is always built with `https://<svc>.apollo.local` URLs.

### Step 2: Read one StatefulSet

Open [`identity-db-sts.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml) and [`identity-db-svc-headless.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/k8s/apps/identity-db/identity-db-svc-headless.yaml):

```yaml
# identity-db-sts.yaml (trimmed)
kind: StatefulSet
spec:
  serviceName: identity-db-headless       # the headless Service that gives each Pod a DNS name
  replicas: 1
  template:
    metadata:
      labels: {app: identity-db, tier: data}
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata   # a subdirectory of the mounted volume
          volumeMounts:
            - {name: pg-data,     mountPath: /var/lib/postgresql/data}   # from the claim template
            - {name: init-script, mountPath: /docker-entrypoint-initdb.d} # schema SQL
      volumes:
        - name: init-script
          configMap: {name: identity-db-init-script}
  volumeClaimTemplates:                   # "give each Pod its own claim from this shape"
    - metadata: {name: pg-data}
      spec:
        accessModes: ["ReadWriteOnce"]    # one node may mount it read-write
        resources: {requests: {storage: 1Gi}}
                                          # no storageClassName: the cluster default is used
---
# identity-db-svc-headless.yaml
kind: Service
spec:
  clusterIP: None                         # "headless": DNS returns Pod IPs, no virtual IP
  selector: {app: identity-db}
  ports: [{port: 5432, targetPort: 5432}]
```

- **What a StatefulSet is:** a controller like a Deployment, but each Pod has a fixed identity: an ordinal name (`identity-db-0`), its own claim, and its own DNS name. A replacement Pod gets the *same* name and the *same* claim.
- **What a PVC is:** a PersistentVolumeClaim is a request: "1Gi, mountable read-write by one node". A **PersistentVolume** (PV) is the actual storage that satisfies it. A **StorageClass** says how to create PVs on demand.
- **Why `volumeClaimTemplates` and not a `volumes:` entry:** a `volumes:` entry would point every replica at one named claim. The template stamps out a claim per Pod, named `<template>-<statefulset>-<ordinal>`: `pg-data-identity-db-0`.
- **Why `PGDATA` is a subdirectory:** the Postgres entrypoint only initialises a database in an **empty** `PGDATA`. Pointing it at `…/data/pgdata` inside the mount keeps that check clean on a fresh volume.
- **Compared with Stage 2:** the Pod template is almost the same Postgres container. What changed is the controller, the volume source (`emptyDir: {}` → claim template), and the schema mount. The app Deployments still connect to `identity-db:5432`, so no app code changed.

### Step 3: Follow the chain down to the bytes

```bash
kubectl get sts,pods -n apollo-airlines-apps -l tier=data
kubectl get pvc -n apollo-airlines-apps
kubectl get sc
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='path={.spec.hostPath.path}{"\n"}node={.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]}{"\n"}reclaim={.spec.persistentVolumeReclaimPolicy}{"\n"}'
docker exec <node> ls <path>/pgdata | head -5     # use the node and path printed above
```

- **What you see:**
  - Pods `identity-db-0`, `flight-db-0`, `booking-db-0`, `redis-0`, all `1/1`.
  - PVCs `pg-data-identity-db-0`, `pg-data-flight-db-0`, `pg-data-booking-db-0`, `redis-data-redis-0`, all `Bound`, 1Gi, RWO.
  - The default StorageClass uses provisioner `rancher.io/local-path` (named `standard` in kind).
  - The PV is a host directory under `/var/local-path-provisioner/…`, pinned to **one node** by `nodeAffinity`, with `reclaim=Delete`.
  - Inside it: `PG_VERSION`, `base`, `pg_wal`. Postgres's real files on the node's disk.
- **The chain:** StatefulSet → claim template → PVC → PV → StorageClass → a directory on one node.
- **Why the PVC waited:** kind's default class binds with `WaitForFirstConsumer`. The volume is only created once the Pod is scheduled, so it lands on the node the Pod actually runs on. A `Pending` PVC before that is normal.
- **What this does not give you:** local-path is a plain directory. No replication, no snapshot, no backup. It survives the Pod, not the node.

### Step 4: See how schema and seed data are now split

```bash
kubectl exec -n apollo-airlines-apps identity-db-0 -- ls /docker-entrypoint-initdb.d   # init.sql
kubectl logs -n apollo-airlines-apps identity-db-0 | grep -iE "running /docker-entrypoint-initdb.d|skipping initialization"
kubectl get jobs -n apollo-airlines-apps                                              # seed-identity-db, seed-flight-db, seed-booking-db
kubectl exec -n apollo-airlines-apps identity-db-0 -- psql -U postgres -d identity -tAc "SELECT count(*) FROM users;"   # 2
```

From [`identity-db-init-script.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/k8s/apps/identity-db/identity-db-init-script.yaml), [`seed-identity-db.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/k8s/jobs/seed-identity-db.yaml) and [`identity-db-seed.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage3/k8s/jobs/identity-db-seed.yaml):

```yaml
# identity-db-init-script (schema only)
data:
  init.sql: |
    CREATE TABLE IF NOT EXISTS users ( ... );
---
# seed-identity-db Job (trimmed)
spec:
  backoffLimit: 3
  template:
    spec:
      serviceAccountName: init-identity-db     # reuses the Stage 1/2 identity
      restartPolicy: OnFailure
      containers:
        - command: [sh, -c, |
            until pg_isready -h identity-db -U postgres; do sleep 2; done
            psql -h identity-db -U postgres -d identity -v ON_ERROR_STOP=1 -f /init/seed.sql]
---
# identity-db-seed (data)
  seed.sql: |
    INSERT INTO users (...) VALUES (... admin ...), (... passenger ...)
    ON CONFLICT (id) DO NOTHING;                # safe to run again
```

- **Schema, via the entrypoint hook:** the official Postgres image runs every file in `/docker-entrypoint-initdb.d` **only when the data directory is empty**. A fresh volume gets the tables. Every later start logs "Skipping initialization" and leaves the data alone.
- **Seed data, via a Job:** two users, six airports, and 31 days of flights (186 rows). `ON CONFLICT DO NOTHING` makes the Job safe to rerun. The booking seed is just `SELECT 1`: bookings are created at runtime.
- **Why not an init container for the schema:** an init container must *finish* before the Postgres container starts. One that waits for `pg_isready` on `127.0.0.1` waits for a server that can't start until it exits. Neither moves. The comment at the top of the StatefulSet file records this.
- **Why split schema from data:** the structure belongs to every copy of the database, so it travels with the Pod's first start. The data load is an operation you choose to run, so it stays a Job.
- **Compared with Stage 2:** one `init-*-db` Job did both, once, with `restartPolicy: Never`. If its database came back empty, nothing recreated even the tables.

### Step 5: See the data survive a Pod replacement

```bash
NS=apollo-airlines-apps
Q() { kubectl exec -n $NS identity-db-0 -- psql -U postgres -d identity -tAc "$1"; }
Q "INSERT INTO users (id,email,password_hash,first_name,last_name) VALUES ('99999999-9999-4999-8999-999999999999','persisted@apollo.local','h','Persist','Test');"
kubectl get pvc pg-data-identity-db-0 -n $NS -o jsonpath='{.spec.volumeName}{"\n"}'
kubectl delete pod identity-db-0 -n $NS
kubectl wait --for=condition=Ready pod/identity-db-0 -n $NS --timeout=90s
Q "SELECT email FROM users WHERE email='persisted@apollo.local';"     # still there
kubectl get pvc pg-data-identity-db-0 -n $NS -o jsonpath='{.spec.volumeName}{"\n"}'   # same PV
Q "DELETE FROM users WHERE email='persisted@apollo.local';"
```

- **What happens:** the StatefulSet recreates a Pod with the **same name**. Because the name is the same, it mounts the same claim, `pg-data-identity-db-0`, and the same PV. Postgres finds a populated directory and skips initialisation.
- **Compared with Stage 1 and 2:** the same `kubectl delete pod` used to wipe the database. The Pod is still disposable. The data no longer lives in it.

What each operation does to the data (all on `identity-db`):

| Operation | Data survives? | Why |
|---|---|---|
| Delete the Pod | Yes, same PV | Replacement has the same name, so the same claim |
| Scale the StatefulSet to 0, then 1 | Yes, same PV | Scaling down never deletes claims; the PVC stays `Bound` with no Pod |
| Delete the StatefulSet and re-apply it | Yes, same PV | Deleting a StatefulSet never deletes its PVCs |
| Delete the PVC | **No**, new PV | `reclaim=Delete` removes the old PV. The new volume is empty: the entrypoint recreates the **tables**, but no rows come back until the seed Job is run again |
| Delete the namespace (`teardown.sh`) | **No** | The PVCs go with the namespace, and their PVs with them |
| Lose or wipe the node | **No** | local-path data is only on that node |

- **The rule:** data lifetime equals PVC lifetime (and, with local-path, node lifetime). Nothing shorter-lived matters.
- **A PVC in use doesn't vanish at once:** a `kubectl delete pvc` sits in `Terminating` (the `kubernetes.io/pvc-protection` finalizer) until no Pod uses it.
- **What would keep the data after a PVC delete:** `persistentVolumeReclaimPolicy: Retain`. The PV then becomes `Released` with data intact, and someone must clear it by hand before it can be reused. Real protection is a backup you have restored at least once: [Recovery boundaries](./learn/storage/recovery-boundaries).

### Step 6: See the two DNS names

```bash
NS=apollo-airlines-apps
R() { kubectl exec -n $NS deploy/identity -- getent hosts "$@"; }
kubectl get pod identity-db-0 -n $NS -o jsonpath='{.status.podIP}{"\n"}'
R identity-db                           # the ClusterIP (10.96.x.x)
R identity-db-headless                  # the Pod IP
R identity-db-0.identity-db-headless    # the Pod IP, by Pod name
```

- **What you see:** the normal Service returns a virtual IP that never changes. The headless names return the Pod's own IP. After a Pod replacement, the headless names return the **new** Pod IP and the ClusterIP stays the same.
- **Why both:** a normal Service load-balances, which is right for clients that don't care which replica answers. A headless Service publishes one record per Pod, so `identity-db-0.identity-db-headless` always means that one Pod. That is what replication and database operators need.
- **What Apollo uses:** the apps connect to `identity-db` (the normal Service), exactly as in Stage 2. The headless Service is there because the StatefulSet's `serviceName` needs it, and for future replicas.
- **Why `getent`:** the identity image (`python:3.12-slim`) has no `nslookup`. `getent hosts` works in any minimal image.
- **Not a replicated database:** scaling to `replicas: 2` would give `identity-db-1` its own claim and its own separate database (tables from the init script, none of `-0`'s rows). A StatefulSet gives identity and storage, not replication.

### Step 7: See that the volume also pins the Pod to a node

```bash
kubectl get pod identity-db-0 -n apollo-airlines-apps -o wide          # NODE column
kubectl get pv $(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}') \
  -o jsonpath='{.spec.nodeAffinity}{"\n"}'
```

- **What it means:** a local-path PV can only be used on its node, so the scheduler must put `identity-db-0` there, every time.
- **The consequence:** if that node is cordoned or drained, a replaced `identity-db-0` stays `Pending` with `FailedScheduling … volume node affinity conflict`. The fix is to make that node schedulable again, not to recreate anything.
- **Compared with Stage 2:** an `emptyDir` database could start on any node, because it started empty anyway. Persistence on node-local disk trades freedom of placement for data that stays. Network-attached volumes (EBS, Persistent Disk) can move between nodes; that is a cloud topic for [Stage 9](./stage-9).

### Step 8: Check the edge and the full workflow

```bash
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
curl -s -o /dev/null -w 'identity readyz=%{http_code}\n' -H "Host: identity.apollo.local" http://$GW/readyz
bash stages/stage3/scripts/verify-tls.sh
bash stages/stage3/scripts/verify.sh
```

- **What happens:** the Gateway, HTTPRoutes and certificate behave exactly as in [Stage 2](./stage-2) Step 8. `verify.sh` also checks StatefulSets, PVCs, headless DNS, seed counts, a passenger booking, and that data survives a database Pod deletion.
- **Same HTTPS rules:** trust the certificate and use `--cacert`, not `-k`. The MetalLB and self-signed certificate cautions from Stage 2 still apply. Re-extract `/tmp/apollo-ca.crt`: this install generated a new certificate.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| PVC `Pending`, event "waiting for first consumer" | Normal with `WaitForFirstConsumer` until a Pod uses it | `kubectl describe pvc <name> -n apollo-airlines-apps` |
| PVC `Pending`, `storageclass … not found` / `ProvisioningFailed` | Wrong class or provisioner (the class is immutable on a PVC: recreate it) | `kubectl describe pvc <name>`; `kubectl get sc` |
| DB Pod `Pending`, "volume node affinity conflict" | The PV's node is cordoned, drained or gone | `kubectl describe pod <db>-0` → Events; `kubectl get nodes` |
| PVC stuck `Terminating` | A Pod still mounts it (`pvc-protection`) | `kubectl get pods -n apollo-airlines-apps -l app=<db>` |
| Login fails, `users` table empty | Fresh volume got schema but seed Job didn't rerun | `kubectl get jobs -n apollo-airlines-apps`; `kubectl logs job/seed-identity-db` |
| A new column or table in the init ConfigMap never appears | Init scripts only run on an empty data directory | `kubectl logs <db>-0 \| grep -i "skipping initialization"`; existing DBs need a migration |
| Service `identity-db` has two endpoints | Stage 2's Deployment is still running next to the StatefulSet | `kubectl get deploy,sts -n apollo-airlines-apps` |
| StatefulSet stuck `0/1` | Postgres not starting; check logs before probes | `kubectl logs <db>-0`; `kubectl describe pod <db>-0` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| Probes are basic; a slow first start and a hung process look alike | The kubelet can't tell "starting" from "stuck" | [Stage 4](./stage-4): startup, liveness and readiness probes |
| No resource requests or limits; no PodDisruptionBudgets | A drain can take a database down; the scheduler is guessing | [Stage 4](./stage-4): requests/limits, PDBs |
| Data lives on one node's disk, one copy | Node loss means data loss | [Stage 9](./stage-9) (planned): cloud volumes |
| No backup or restore | A deleted PVC is gone for good | [Stage 9](./stage-9) (planned): Velero |
| Schema changes need a manual migration | Init scripts don't rerun on existing data | Not covered in the verified stages |
| Dozens of YAML files applied by a script | Repeated values; no environments; no release history | [Stage 5](./stage-5): Helm, Kustomize, Argo CD |
| Any Pod can reach any database | No network rules between namespaces or tiers | Stage 8 (planned): NetworkPolicies |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | **Stage 3** |
|---|---|---|---|---|---|
| Runs on | One Docker host | Three-node kind cluster | Same cluster | Same cluster | Same cluster |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment | **Deployment (apps) + StatefulSet (data)** |
| Recovery | `restart:` on one host | None | ReplicaSet replaces Pods | Same | **Same Pod name, same volume** |
| Namespaces | — | `default` | `apollo-airlines` | `apollo-airlines-apps` / `-ui` | Same |
| Service discovery | Docker DNS | Pod IP only | Service + cluster DNS | Cross-namespace DNS names | **+ headless per-Pod names** |
| External access | `ports:` | `kubectl port-forward` | NodePort | Envoy Gateway on a MetalLB IP | Same |
| TLS | None | None | None | Wildcard cert at the Gateway | Same |
| Config / secrets | `environment:` | Inline in `pod.yaml` | ConfigMap / Secret | One copy per namespace | Same |
| Data | Named volume | — | `emptyDir` (ephemeral) | `emptyDir` (ephemeral) | **PVC per Pod (local-path, 1Gi)** |
| Schema and seed | `init.sql` mount | — | One Job per DB | One Job per DB | **Entrypoint hook + seed Job** |

## Clean up

```bash
bash stages/stage3/scripts/teardown.sh     # deletes the namespaces; PVCs and their PVs go too
kubectl get ns apollo-airlines-apps apollo-airlines-ui envoy-gateway-system metallb-system   # all NotFound
kubectl get pv                             # no apollo claims left
```

Teardown deletes the data. That is intended: the next stage starts from its own snapshot. The kind cluster stays.

## You should now be able to explain

- Why `identity-db-0` comes back with its data when Stage 2's database did not.
- How a StatefulSet's claim template becomes a PVC, a PV and a directory on one node.
- Which operations keep the data (Pod, scale, StatefulSet delete) and which lose it (PVC delete, namespace delete, node loss).
- Why the schema runs from `/docker-entrypoint-initdb.d` and the seed runs as a Job, and why an init container would deadlock.
- What a headless Service returns, and why the apps still use the normal one.
- Why node-local storage pins a database Pod to one node.

**Next:** [Stage 4: Flight Control](./stage-4) teaches the kubelet to tell "starting" from "stuck", and protects these databases during drains.
