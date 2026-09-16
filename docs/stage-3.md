---
title: "Stage 3: Mission Data — Persistent Storage & StatefulSets"
description: "Replace emptyDir with 1Gi PersistentVolumeClaims, convert databases to StatefulSets, bootstrap schemas via the Postgres entrypoint hook, and prove data persistence."
---

# Stage 3: Mission Data — Persistent Storage & StatefulSets

**Goal:** Provide durable storage for stateful workloads that survives Pod restarts and node rescheduling. Convert `identity-db`, `flight-db`, `booking-db`, and `redis` from `Deployment` + `emptyDir` to **`StatefulSet` + `PersistentVolumeClaim` (PVC)**, with stable per-pod network identity, schema bootstrapping through the official PostgreSQL entrypoint hook, and idempotent data seeding via one-shot Jobs.

The Envoy Gateway + MetalLB access stack established in Stage 2 carries forward completely unchanged.

| | |
|---|---|
| **New Concepts** | `StatefulSet`, `VolumeClaimTemplate`, Headless Service (`clusterIP: None`), Postgres entrypoint hook (`/docker-entrypoint-initdb.d/`), PVC lifecycle, `StorageClass` (`local-path`) |
| **Workloads Changed** | 4 (3 PostgreSQL databases + Redis converted to StatefulSets) |
| **Workloads Unchanged** | 6 (all application Deployments, Envoy Gateway, MetalLB) |
| **Code Changes** | None (application code connects to the same database Service names) |
| **Verification Target** | **68/68 checks pass** |

---

## Why emptyDir Is Not Enough

In Stages 1 and 2, all database Deployments mounted temporary `emptyDir` volumes:

```text
emptyDir (Stages 1 & 2):
Pod created  ──► emptyDir allocated in host RAM/disk
Pod deleted  ──► volume destroyed permanently ──► ALL DATA LOST
New Pod starts ──► Fresh, empty directory
```

`emptyDir` is suitable only for temporary scratch space or ephemeral caches. For relational databases, storage lifecycle must be completely decoupled from Pod lifecycle.

In Stage 3, we switch to **`PersistentVolumeClaim` (PVC)**:

```text
PersistentVolumeClaim (Stage 3):
PVC (1Gi, ReadWriteOnce) binds to PV provisioned by StorageClass
Pod deleted  ──► PV remains intact on storage provider
New Pod starts ──► StatefulSet re-attaches the EXACT SAME PVC ──► DATA PRESERVED
```

---

## Deployment vs StatefulSet

| Feature | Deployment | StatefulSet |
|---|---|---|
| **Pod Naming** | Random string (e.g. `identity-db-7d8f9-xvw2j`) | Stable ordinal (e.g. `identity-db-0`, `identity-db-1`) |
| **Storage Model** | Shared volume or ephemeral | Dedicated per-pod volume via `volumeClaimTemplates` |
| **Startup / Scaling** | Replicas launch concurrently | Sequential ordered startup: pod $N+1$ waits for pod $N$ to be `Ready` |
| **Service Binding** | `type: ClusterIP` (virtual load balancer) | **Headless Service** (`clusterIP: None`) for direct DNS resolution |
| **Best For** | Stateless web apps, APIs | Relational databases, stateful clusters, message brokers |

---

## Headless Services: Why StatefulSets Require Them

A standard Service provides a virtual ClusterIP that randomly load-balances requests across all backing Pods.

A **Headless Service** sets `clusterIP: None`. Instead of returning a single virtual IP, CoreDNS directly returns the A records of the individual Pod IPs:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: identity-db-headless
  namespace: apollo-airlines-apps
spec:
  clusterIP: None  # <-- Headless
  selector:
    app: identity-db
  ports:
    - port: 5432
      name: postgres
```

When coupled with a StatefulSet (`spec.serviceName: identity-db-headless`), CoreDNS automatically provisions stable, deterministic FQDNs for every individual replica:

```text
identity-db-0.identity-db-headless.apollo-airlines-apps.svc.cluster.local -> 10.244.1.5
identity-db-1.identity-db-headless.apollo-airlines-apps.svc.cluster.local -> 10.244.2.7
```

:::info App Services Connect via ClusterIP
Application microservices (`identity`, `flight`, `booking`) continue connecting to their regular ClusterIP Services (`identity-db:5432`). The Headless Service exists to provide network identity and peer discovery for the StatefulSet.
:::

---

## Schema Initialization: The Entrypoint Hook Pattern

### Why Init Containers Deadlock

A common Kubernetes anti-pattern is writing an `initContainer` that attempts to run `psql` against `127.0.0.1` after `pg_isready`:

```yaml
# WARNING: THIS PATTERN DEADLOCKS! DO NOT USE!
initContainers:
  - name: init-db
    image: postgres:15-alpine
    command: ["sh", "-c", "until pg_isready -h 127.0.0.1; do sleep 1; done; psql -f /init.sql"]
```

**Why it deadlocks:** The kubelet will not start the main container until all init containers have exited with status code `0`. Because PostgreSQL runs in the **main container**, `pg_isready` against `127.0.0.1` will wait forever, preventing the main container from ever starting!

### The Solution: Official PostgreSQL Entrypoint Hook

Instead of a custom init container, we use the official PostgreSQL container's built-in `/docker-entrypoint-initdb.d/` mechanism. We mount our schema ConfigMap to this directory and set `PGDATA=/var/lib/postgresql/data/pgdata`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: identity-db
  namespace: apollo-airlines-apps
spec:
  serviceName: identity-db-headless
  replicas: 1
  template:
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: pg-data
              mountPath: /var/lib/postgresql/data
            - name: init-script
              mountPath: /docker-entrypoint-initdb.d
      volumes:
        - name: init-script
          configMap:
            name: identity-db-init-script
  volumeClaimTemplates:
    - metadata:
        name: pg-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

**How this ensures idempotency:**
1. On **first start** with an empty PVC, the `/var/lib/postgresql/data/pgdata` directory does not exist. The PostgreSQL entrypoint runs `initdb` and executes all `.sql` scripts inside `/docker-entrypoint-initdb.d/`.
2. On **subsequent restarts**, the entrypoint detects that `pgdata` is non-empty. It skips `initdb` and ignores `/docker-entrypoint-initdb.d/` entirely, preserving existing database state!
3. Idempotent seed data is handled by separate **one-shot Jobs** using `ON CONFLICT DO NOTHING`.

---

## StorageClasses: How PVs Are Provisioned

A `PersistentVolumeClaim` (PVC) is an abstract user request for storage. A `StorageClass` defines the dynamic provisioner that fulfills the claim.

In local `kind` clusters, the default StorageClass is `rancher.io/local-path`. It dynamically allocates a `hostPath` directory on the worker node where the Pod is scheduled:

```bash
kubectl get storageclass
# NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
# local-path (default) rancher.io/local-path   Delete          WaitForFirstConsumer
```

In cloud environments (such as AWS EKS in [Stage 9](./stage-9.md)), this is replaced by CSI drivers such as `ebs.csi.aws.com` provisioning AWS gp3 EBS volumes.

---

## Hands-On Lab: Deploy Stage 3

Run the automated orchestrator from the repository root:

```bash
cd stages/stage3
./scripts/apply.sh
```

### The 10-Step Orchestration Sequence

1. **Build & Load Images:** Application microservices and frontend loaded into kind.
2. **Namespaces, Config, Secrets:** Sets up `apollo-airlines-apps` and `apollo-airlines-ui`.
3. **ServiceAccounts:** Creates 13 identities with token automount disabled.
4. **Deploy Workloads:** Launches 4 StatefulSets, 6 Deployments, 4 Headless Services, and ClusterIP Services.
5. **Wait for StatefulSets:** Blocks until `kubectl rollout status statefulset/*` completes and the PostgreSQL readiness probe (`pg_isready`) succeeds.
6. **Seed Jobs:** Launches the 3 database seed Jobs.
7. **Wait for Seed Jobs:** Ensures all flight, user, and airport rows are seeded before exposing traffic.
8. **MetalLB:** Deploys IP address pool and L2 advertisement.
9. **Envoy Gateway:** Installs GatewayClass, Gateway, HTTPRoutes, and ReferenceGrant.
10. **Print LoadBalancer IP:** Prints the assigned IP (e.g. `172.18.0.50`).

### Configure Local Hostname Resolution

Map the MetalLB IP (e.g., `172.18.0.50`) in `/etc/hosts`:

```bash
# Add to /etc/hosts:
172.18.0.50  frontend.apollo.local identity.apollo.local flight.apollo.local booking.apollo.local search.apollo.local
```

Or test directly with `curl` using the `Host` header:
```bash
curl -H "Host: frontend.apollo.local" http://172.18.0.50/
```

---

## Test Persistence: The Break & Recover Experiment

The fundamental objective of Stage 3 is **data survival across Pod destruction**. Let's prove it.

### Step 1: Inspect Current Data

Query the number of users seeded in `identity-db-0`:

```bash
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c 'SELECT count(*) FROM users;'
# Output:
#  count 
# -------
#      2
```

### Step 2: Destroy the Database Pod

Delete the running StatefulSet Pod:

```bash
kubectl delete pod -n apollo-airlines-apps identity-db-0
```

Watch the StatefulSet automatically detect the missing replica and recreate it:

```bash
kubectl get pods -n apollo-airlines-apps -l app=identity-db -w
# identity-db-0   Terminating         ...
# identity-db-0   ContainerCreating   ...
# identity-db-0   Running (1/1)       ...
```

### Step 3: Verify Data Intact

Query the newly spawned Pod:

```bash
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c 'SELECT count(*) FROM users;'
# Output:
#  count 
# -------
#      2
```

The count remains 2! The new Pod re-attached the existing `pg-data-identity-db-0` PVC and found the database fully intact.

### Step 4: Insert Custom Data & Retest

Insert a new record, delete the Pod again, and verify the custom record survives:

```bash
# Insert custom user
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c \
  "INSERT INTO users (email, password_hash) VALUES ('persist-test@apollo.local', 'hash123');"

# Terminate the pod again
kubectl delete pod -n apollo-airlines-apps identity-db-0

# Wait for pod recovery
kubectl wait --for=condition=Ready pod/identity-db-0 -n apollo-airlines-apps --timeout=60s

# Prove the custom record survived
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c \
  "SELECT email FROM users WHERE email = 'persist-test@apollo.local';"
# Output:
#           email          
# -------------------------
#  persist-test@apollo.local
```

---

## Maintainer Verification

Run the verification test suite:

```bash
./scripts/verify.sh
```

**Result: 68/68 checks pass**, validating:
- 4 core namespaces (`apps`, `ui`, `envoy-gateway-system`, `metallb-system`).
- Token automount disabled on all 13 ServiceAccounts.
- 4 StatefulSets Ready (1/1) and bound to 1Gi PVCs.
- 4 Headless Services resolving direct Pod IPs via CoreDNS.
- Seed data integrity (2 users, 6 airports, 186 flights).
- Envoy Gateway HTTP 200 responses across all 6 HTTPRoutes.
- End-to-end flight booking creation and database survival.

---

## Clean Up

Tear down Stage 3 resources:

```bash
./scripts/teardown.sh
```

The script cleans up PVCs, StatefulSets, Deployments, Envoy Gateway, and MetalLB, auditing the cluster for zero residue.

---


### Exact Failure Injection (from verify.sh)

To prove that the StatefulSet's PersistentVolumeClaim correctly preserves data across Pod deletion:

1. Create a booking through the Gateway (this writes a row to `booking-db-0`):
```bash
EG_IP=$(kubectl get svc -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=apollo-gateway -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}')
TOKEN=$(curl -s -X POST "http://${EG_IP}/api/users/login" -H "Host: identity.apollo.local" -H "Content-Type: application/json" -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -r .token)
FLIGHT_ID=$(curl -s -H "Host: flight.apollo.local" "http://${EG_IP}/api/flights" | jq -r '.flights[0].id')
BOOKING_ID=$(curl -s -X POST "http://${EG_IP}/api/bookings" -H "Host: booking.apollo.local" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"flightId\":\"${FLIGHT_ID}\"}" | jq -r .id)
```

2. Break it by deleting the database pod forcefully:
```bash
kubectl delete pod booking-db-0 -n apollo-airlines-apps --wait=true
```

3. Wait for the StatefulSet controller to recreate the pod and reattach the PVC:
```bash
kubectl wait --for=condition=Ready pod/booking-db-0 -n apollo-airlines-apps --timeout=60s
```

4. Verify the data survived inside the new pod:
```bash
kubectl exec -n apollo-airlines-apps booking-db-0 -- psql -U postgres -d booking -tAc "SELECT id FROM bookings WHERE id='${BOOKING_ID}';"
# Expected Output: The exact $BOOKING_ID string should be returned, proving survival.
```


## Explain & Review Questions

1. **Why does a StatefulSet require a Headless Service (`clusterIP: None`)?**
   Stateful applications often need direct peer-to-peer communication (e.g. database clustering, replication leader election). A Headless Service ensures CoreDNS resolves stable individual hostnames (`pod-0.headless-svc...`) directly to Pod IPs rather than through a virtual IP.

2. **What is the operational difference between `volumes` and `volumeClaimTemplates`?**
   `volumes` attaches the same volume to all replicas of a Pod template. `volumeClaimTemplates` dynamically generates a unique, dedicated `PersistentVolumeClaim` for each replica ordinal (e.g., `pg-data-identity-db-0`, `pg-data-identity-db-1`).

3. **Why is schema mounted to `/docker-entrypoint-initdb.d/` rather than an init container?**
   An init container checking `127.0.0.1` deadlocks because the main container running PostgreSQL hasn't started yet. The entrypoint hook executes natively during first-boot initialization and is safely skipped on restarts.

4. **When does a PVC release its PersistentVolume?**
   A PVC retains its bound PV until the PVC object itself is deleted. Under a `Retain` reclaim policy, the PV remains intact on disk even after PVC deletion. Under a `Delete` policy (default in kind), deleting the PVC deletes the backing storage.

---

## What's Next

Now that our data is persistent, [Stage 4: Flight Control](./stage-4.md) introduces **comprehensive workload governance**: three-tier health probes, Guaranteed QoS resource limits, graceful SIGTERM drains, PriorityClasses, topology spread constraints, and PodDisruptionBudgets.