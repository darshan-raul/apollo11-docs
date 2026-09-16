---
title: "Stage 3 — Mission Data: Persistent Storage & StatefulSets"
description: "Replace ephemeral storage with StatefulSets, PersistentVolumeClaims, StorageClasses, headless Services, and entrypoint schema bootstrapping."
sidebar_label: "Stage 3: Mission Data (Storage)"
---

# Stage 3: Mission Data — Persistent Storage & StatefulSets

In Stage 1, we exposed a critical architectural flaw: when you delete a database Pod running with `emptyDir` storage, all database records are permanently lost.

In **Stage 3 (Mission Data)**, we fix this permanently. We convert all four stateful workloads (`identity-db`, `flight-db`, `booking-db`, and `redis`) from `Deployment + emptyDir` to **`StatefulSet + PersistentVolumeClaim`**. The Envoy Gateway + MetalLB edge access stack from Stage 2 carries forward unchanged.

```mermaid
flowchart TD
  subgraph StorageClassLayer ["Dynamic Storage Provisioning"]
    SC["StorageClass: standard (local-path)\n(volumeBindingMode: WaitForFirstConsumer)"]
  end

  subgraph StatefulSetLayer ["StatefulSet: identity-db (Replicas: 1)"]
    STS["StatefulSet Controller\n(serviceName: identity-db-headless)"]
    VCT["volumeClaimTemplates: pg-data\n(1Gi, ReadWriteOnce)"]
    STS --> VCT
  end

  subgraph PVCLayer ["PersistentVolumeClaim & PersistentVolume"]
    PVC["PVC: pg-data-identity-db-0\n(Status: Bound)"]
    PV["PersistentVolume: pvc-xxx\n(Capacity: 1Gi, Reclaim: Delete)"]
    VCT --> PVC
    SC -->|Dynamic Provisioning| PV
    PVC <-->|Bound| PV
  end

  subgraph PodIdentity ["Stable Pod & Volume Mount"]
    POD["Pod: identity-db-0\n(Ordinal: 0, Node: worker1)"]
    DISK[("Host Disk: /var/local-path-provisioner/...\n(/var/lib/postgresql/data)")]
    POD -->|Mounts pg-data| DISK
    PV --> DISK
  end

  subgraph HeadlessDNS ["Headless Service: identity-db-headless"]
    HSVC["Service: clusterIP: None\n(identity-db-0.identity-db-headless)"]
    HSVC -.->|Direct Pod IP| POD
  end
```

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Explain why databases require **`StatefulSet`** rather than `Deployment`.
2. Understand the storage abstraction chain: **`PersistentVolumeClaim` (PVC) → `PersistentVolume` (PV) → `StorageClass`**.
3. Configure **`volumeClaimTemplates`** to automatically provision unique, sticky storage per replica.
4. Understand how **Headless Services** (`clusterIP: None`) provide stable DNS identity for stateful replicas.
5. Avoid the classic **init container deadlock** by leveraging PostgreSQL's `/docker-entrypoint-initdb.d/` lifecycle hook.
6. Prove volume persistence by destroying a database Pod and verifying data retention.

---

## 💾 The Storage Dilemma: `emptyDir` vs. Persistent Volumes

In Kubernetes, container filesystems are ephemeral by default. If a container crashes, the kubelet restarts it with a clean rootfs.

To share storage between containers in a Pod or survive container restarts, Kubernetes provides Volumes. But not all volumes are persistent:

| Storage Type | Survives Container Restart? | Survives Pod Deletion? | Survives Worker Node Reboot? | Use Case in Apollo11 |
|---|---|---|---|---|
| **`emptyDir`** | ✅ Yes | ❌ **LOST** | ❌ **LOST** | Temporary scratch space (`/tmp`), cache |
| **`hostPath`** | ✅ Yes | ✅ Yes (on *that* node) | ⚠️ Node-dependent | Local testing only; breaks portability |
| **`PersistentVolume` (PVC)** | ✅ Yes | ✅ **SURVIVES** | ✅ **SURVIVES** | Relational databases (`PostgreSQL`), Redis |

### The PVC → PV → StorageClass Relationship

Kubernetes decouples storage using an API pattern similar to interfaces and implementations in programming:

1. **`PersistentVolumeClaim` (PVC)**: The *request* for storage written by the application author. It specifies: *"I need 1 GiB of disk space with `ReadWriteOnce` access."*
2. **`PersistentVolume` (PV)**: The actual piece of storage in the cluster (e.g. an AWS EBS volume, a GCP Persistent Disk, or a local directory on kind).
3. **`StorageClass`**: The *provisioner* that dynamically creates PVs on demand when a PVC is submitted.

```
Application Author                 Cluster Administrator / Cloud Provider
┌───────────────────────────┐      ┌───────────────────────────────┐
│ PersistentVolumeClaim     │      │ StorageClass (Driver / CSI)   │
│ (e.g. 1Gi, ReadWriteOnce) │      │ (e.g. local-path, ebs.csi)    │
└─────────────┬─────────────┘      └──────────────┬────────────────┘
              │                                   │
              └───────────────► ◄─────────────────┘
                                │
                                ▼
                   ┌─────────────────────────────┐
                   │ PersistentVolume (PV)       │
                   │ (Bound to PVC, Backed by    │
                   │  Real Physical Storage)     │
                   └─────────────────────────────┘
```

#### Access Modes Explained:
- **`ReadWriteOnce` (RWO)**: The volume can be mounted as read-write by a **single node** at a time. This is standard for block storage (EBS, local disks) and databases like PostgreSQL.
- **`ReadOnlyMany` (ROX)**: The volume can be mounted read-only by many nodes simultaneously.
- **`ReadWriteMany` (RWX)**: The volume can be mounted read-write by many nodes at once (requires networked file systems like NFS or AWS EFS).

---

## 🏛️ StatefulSet vs. Deployment

Why couldn't we just attach a PVC to our existing `Deployment` in Stage 1?

| Property | Deployment | StatefulSet |
|---|---|---|
| **Pod Naming** | Random hash suffix: `booking-68697c45bf-x9z2p` | Deterministic ordinal index: `identity-db-0`, `identity-db-1` |
| **Identity Contract** | Pods are completely interchangeable and disposable | Pods have unique, persistent identity across restarts |
| **Storage Binding** | All replicas share the exact same volume (or none) | Each replica gets its own dedicated PVC via `volumeClaimTemplates` |
| **Scaling Order** | Replicas scale up/down in parallel | Strict sequential order: Pod 1 starts only after Pod 0 is Ready |
| **DNS Contract** | Replicas behind a shared virtual ClusterIP | Each Pod gets its own addressable DNS FQDN via Headless Service |

---

## 🔍 Manifest Deep Dive: `identity-db`

Let's examine how `identity-db` is defined in Stage 3:

*Source: `stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml`*

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: identity-db
  namespace: apollo-airlines-apps
spec:
  serviceName: identity-db-headless
  replicas: 1
  selector:
    matchLabels:
      app: identity-db
  template:
    metadata:
      labels:
        app: identity-db
        tier: data
    spec:
      serviceAccountName: identity-db
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              value: "postgres"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: apollo-airlines-secrets
                  key: POSTGRES_PASSWORD
            - name: POSTGRES_DB
              value: "identity"
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: pg-data
              mountPath: /var/lib/postgresql/data
            - name: init-script
              mountPath: /docker-entrypoint-initdb.d
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres", "-d", "identity"]
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres", "-d", "identity"]
            initialDelaySeconds: 5
            periodSeconds: 5
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

### Critical Fields Analyzed:

1. **`serviceName: identity-db-headless`**:
   Connects the StatefulSet to its companion Headless Service. This grants `identity-db-0` a dedicated DNS A-record:
   `identity-db-0.identity-db-headless.apollo-airlines-apps.svc.cluster.local`.
2. **`volumeClaimTemplates`**:
   Unlike a standard `volumes` block, this is a **template** that instructs the StatefulSet controller to generate a unique PVC for each ordinal pod:
   `pg-data-identity-db-0`.
   If you scaled `replicas: 3`, it would automatically generate `pg-data-identity-db-1` and `pg-data-identity-db-2`.
3. **`PGDATA: /var/lib/postgresql/data/pgdata`**:
   PostgreSQL requires its data directory to be a subdirectory within the mounted volume to avoid permission conflicts with filesystem metadata (`lost+found`).

---

## ⚡ The Headless Service (`clusterIP: None`)

A standard Service provides a single virtual ClusterIP that load-balances connections randomly across backing pods.

A **Headless Service** explicitly sets `clusterIP: None`:

*Source: `stages/stage3/k8s/apps/identity-db/identity-db-svc-headless.yaml`*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: identity-db-headless
  namespace: apollo-airlines-apps
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: identity-db
  ports:
    - port: 5432
      targetPort: 5432
```

### How DNS Differs:
- **Normal Service (`identity-db`)**: A DNS lookup for `identity-db` returns the virtual IP `10.96.140.50`.
- **Headless Service (`identity-db-headless`)**: A DNS lookup returns the **direct IP address of the Pod** (`10.244.1.15`).
- Furthermore, CoreDNS automatically publishes predictable per-pod records:
  `identity-db-0.identity-db-headless.apollo-airlines-apps.svc.cluster.local`.

:::note Why We Keep Both Services
Apollo microservices (like `identity`) connect to the normal `identity-db:5432` Service. The headless service is used by Kubernetes for pod identity and is essential for clustered database replication (like Patroni or repmgr).
:::

---

## ⚠️ Real-World Bug: The Init Container Deadlock

During the development of Stage 3, an intuitive architecture was attempted:
*Add an `initContainers` block that waits for PostgreSQL to start, then runs `psql -f /init.sql`.*

### Why It Deadlocks:
1. Kubernetes strictly guarantees that **`initContainers` must run to successful completion before main containers start**.
2. If the init container executes `until pg_isready -h 127.0.0.1; do sleep 1; done`, it will loop forever.
3. Why? Because PostgreSQL is inside the **main container**, which the kubelet will not start until the init container exits!
4. Result: Init waits for Main; Main waits for Init. The Pod is stuck in `Init:0/1` forever.

### The Idiomatic Solution: The Entrypoint Hook
Official PostgreSQL Docker images include a built-in lifecycle hook:
Any `.sql` or `.sh` script placed in `/docker-entrypoint-initdb.d/` is executed **only once during database initialization** (when the data directory is completely empty).
By mounting our schema ConfigMap to `/docker-entrypoint-initdb.d/`, PostgreSQL runs the SQL schema automatically on first boot, and cleanly skips it on every subsequent restart!

---

## 🧪 Hands-On Guided Exercises

### Exercise 1: Deploy Stage 3 and Inspect Storage

- **Objective**: Deploy StatefulSets and inspect dynamic PV/PVC provisioning.
- **Starting Point**: Running `kind-apollo11` cluster.
- **Instructions**:

```bash
cd Apollo11

# 1. Apply Stage 3
bash stages/stage3/scripts/apply.sh

# 2. Inspect StatefulSets and Pods in apollo-airlines-apps
kubectl get statefulsets,pods -n apollo-airlines-apps -l tier=data

# 3. Inspect PVCs and bound PVs
kubectl get pvc,pv -n apollo-airlines-apps
```

- **Expected Result**:
  - `identity-db-0`, `flight-db-0`, `booking-db-0`, and `redis-0` all report `1/1 Running`.
  - PVCs (`pg-data-identity-db-0`, etc.) show `STATUS: Bound` to dynamically created `PersistentVolume` objects.
  - StorageClass is `standard (default)` using kind's `rancher.io/local-path` provisioner.
- **Verification Script**:

```bash
bash stages/stage3/scripts/verify.sh
```
All 68/68 checks must pass!

---

### Exercise 2: Verifying Headless Service DNS Resolution

- **Objective**: Prove that CoreDNS resolves the Headless Service directly to Pod IPs.
- **Starting Point**: Stage 3 running.
- **Instructions**:

```bash
# 1. Get the actual Pod IP of identity-db-0
POD_IP=$(kubectl get pod identity-db-0 -n apollo-airlines-apps -o jsonpath='{.status.podIP}')
echo "identity-db-0 IP: ${POD_IP}"

# 2. Resolve the headless service hostname from the identity application pod
kubectl exec -n apollo-airlines-apps deploy/identity -- getent hosts identity-db-0.identity-db-headless
```

- **Expected Result**:
  The command prints `${POD_IP} identity-db-0.identity-db-headless...`.
  The DNS query bypassed virtual ClusterIPs and returned the direct Pod IP!

---

### Exercise 3: The Persistence Proof (The Core Lab)

- **Objective**: Prove that data written to `identity-db` survives Pod destruction.
- **Starting Point**: Healthy `identity-db-0` Pod.
- **Instructions**:

```bash
# 1. Check current users seeded in identity-db
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c "SELECT email FROM users;"

# 2. Insert a brand-new user record
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c "INSERT INTO users (id, email, password_hash, full_name) VALUES ('usr-persist-99', 'persisted@apollo.local', 'hash99', 'Persistence Test');"

# 3. Verify the new user is present
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c "SELECT email FROM users WHERE id='usr-persist-99';"

# 4. DELETE THE POD!
kubectl delete pod identity-db-0 -n apollo-airlines-apps

# 5. Wait for the StatefulSet controller to recreate identity-db-0
kubectl wait --for=condition=Ready pod/identity-db-0 -n apollo-airlines-apps --timeout=60s

# 6. Re-query the database for the user record
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c "SELECT email, full_name FROM users WHERE id='usr-persist-99';"
```

- **Expected Result**:
  The record `persisted@apollo.local | Persistence Test` is **100% INTACT**!
- **What Concept This Reinforces**:
  When `identity-db-0` was deleted, its ephemeral container was destroyed, but its `PersistentVolumeClaim` (`pg-data-identity-db-0`) and physical disk remained untouched. When the StatefulSet recreated `identity-db-0`, it re-attached the exact same PVC, preserving all data!

---

### Exercise 4: Volume Reclaim Policy & PVC Lifecycle

- **Objective**: Understand what happens to PVs when PVCs are deleted.
- **Starting Point**: Stage 3 running.
- **Instructions**:

```bash
# 1. Check the Reclaim Policy on the PersistentVolume
kubectl get pv $(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
```

- **Analysis**:
  Notice `RECLAIM POLICY: Delete`.
  - If `ReclaimPolicy: Delete`: Deleting the **PVC** automatically deletes the underlying physical storage disk.
  - If `ReclaimPolicy: Retain`: Deleting the PVC keeps the PV in `Released` state, preventing accidental data destruction until an administrator manually cleans it up.
  :::danger Deleting a StatefulSet Does Not Delete PVCs
  In Kubernetes, running `kubectl delete statefulset identity-db` deliberately leaves PVCs intact! This safety mechanism prevents accidental data loss during application uninstalls.
  :::

---

## 🏁 What You Learned

- Why stateful workloads require `StatefulSet` rather than `Deployment`.
- How the storage abstraction chain (`PVC` → `PV` → `StorageClass`) separates storage requests from infrastructure drivers.
- How `volumeClaimTemplates` generates per-ordinal sticky PVCs.
- How Headless Services (`clusterIP: None`) provide stable per-pod network identity.
- How to avoid init container deadlocks by using `/docker-entrypoint-initdb.d/` hooks.
- How to verify data survival across stateful Pod replacement.

---

## ✈️ Before Continuing: Checkpoint

Before moving to Stage 4, confirm:
1. Why does `identity-db-0` get the exact same PVC reattached after deletion?
2. What would happen if an init container ran `pg_isready -h 127.0.0.1` before the main container started?
3. What is the difference between deleting a StatefulSet Pod and deleting its PVC?
4. How does an application decide whether to connect via a Headless Service or a normal ClusterIP Service?

Now that our data layer is safe and permanent, let's explore production reliability, resource limits, health probes, and graceful shutdown!

👉 **Continue to [Stage 4: Flight Control (Reliability, Probes & QoS)](./stage-4)**
