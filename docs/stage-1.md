---
title: "Stage 1 — Liftoff: Workloads on Kubernetes"
description: "Deploy all 10 Apollo Airlines workloads using Deployments, ReplicaSets, Services, ConfigMaps, Secrets, Jobs, and tokenless ServiceAccounts."
sidebar_label: "Stage 1: Liftoff (Workloads)"
---

# Stage 1: Liftoff — Workloads on Kubernetes

In Ignition, you deployed a single, bare Pod and proved that when a bare Pod is deleted, it is gone forever.

In **Stage 1 (Liftoff)**, you bring the entire 10-component Apollo Airlines fleet onto Kubernetes inside a dedicated `apollo-airlines` namespace. You will replace bare Pods with self-healing **Deployments**, establish stable networking using **Services**, externalize configuration using **ConfigMaps** and **Secrets**, run one-time database initializations using **Jobs**, and enforce workload identity with **ServiceAccounts**.

```mermaid
flowchart TD
  subgraph Namespace ["Namespace: apollo-airlines"]
    subgraph ConfigLayer ["Configuration & Security"]
      CM["ConfigMap: apollo-airlines-config\n(Ports, Service URLs)"]
      SEC["Secret: apollo-airlines-secrets\n(POSTGRES_PASSWORD, JWT_SECRET)"]
      SA["13 ServiceAccounts\n(automountServiceAccountToken: false)"]
    end

    subgraph Controllers ["Controllers & Reconciliation"]
      DEP["Deployment: booking\n(Desired: 2 Replicas)"]
      RS["ReplicaSet: booking-68697c45bf\n(Maintains Replicas)"]
      DEP --> RS
    end

    subgraph WorkloadPods ["Workload Pods"]
      P1["Pod: booking-xxx\n(IP: 10.244.1.5)"]
      P2["Pod: booking-yyy\n(IP: 10.244.2.8)"]
      RS --> P1
      RS --> P2
    end

    subgraph Networking ["Service Abstraction"]
      SVC["Service: booking\n(ClusterIP: 10.96.120.40 :8082)\n(NodePort: 30082)"]
      EPS["EndpointSlice\n[10.244.1.5:8082, 10.244.2.8:8082]"]
      SVC --> EPS
      EPS -.-> P1
      EPS -.-> P2
    end

    subgraph BatchInit ["Database Bootstrap"]
      JOB["Job: init-booking-db\n(batch/v1)"]
      JOB --> INIT_POD["Pod: init-booking-db-zzz\n(Runs init.sql & Exits)"]
    end
  end
```

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Explain the 3-tier ownership hierarchy: **Deployment → ReplicaSet → Pods**.
2. Explain the **reconciliation control loop** and how desired state replaces failed Pods.
3. Understand how **Services** provide stable virtual IPs and load balance traffic across dynamic Pod IPs.
4. Master the **Label and Selector contract** that binds Deployments to Pods, and Services to Endpoints.
5. Safely inject configuration and credentials using **ConfigMaps** and **Secrets**.
6. Run finite, one-shot database migrations using Kubernetes **Jobs**.
7. Enforce least-privilege workload identity using dedicated, tokenless **ServiceAccounts**.
8. Execute zero-downtime **Rolling Updates**, diagnose `ImagePullBackOff`, and execute instant rollbacks.
9. Understand the critical limitations of `emptyDir` ephemeral storage for databases.

---

## 🧩 Concepts & Manifest Deep Dive

### 1. Deployments and ReplicaSets: The Self-Healing Hierarchy

In Kubernetes, you almost never create Pods directly in production. Instead, you declare a **Deployment**.

Why does Kubernetes use three objects (`Deployment`, `ReplicaSet`, `Pod`) instead of one?
- **Pod**: Represents the running container(s). Pods are ephemeral; their IPs change when replaced.
- **ReplicaSet**: Its sole responsibility is to maintain a stable set of identical replica Pods running at any given time. If a Pod crashes or its worker node is powered off, the ReplicaSet controller notices that `observed_replicas < desired_replicas` and immediately creates a replacement.
- **Deployment**: Manages **versions and updates**. When you change a container image or configuration, the Deployment creates a *new* ReplicaSet for the new version, gradually scales up the new ReplicaSet while scaling down the old one (a rolling update), and keeps the old ReplicaSet around so you can rollback instantly if something breaks!

Let's examine the `booking` service Deployment:

*Source: `stages/stage1/k8s/apps/booking/booking-dep.yaml`*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: booking
  namespace: apollo-airlines
spec:
  replicas: 2
  selector:
    matchLabels:
      app: booking
  template:
    metadata:
      labels:
        app: booking
    spec:
      serviceAccountName: booking
      containers:
        - name: booking
          image: apollo11/booking:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8082
          env:
            - name: DATABASE_URL
              value: "postgresql://postgres:postgres@booking-db:5432/booking?sslmode=disable"
            - name: FLIGHT_SERVICE_URL
              valueFrom:
                configMapKeyRef:
                  name: apollo-airlines-config
                  key: FLIGHT_SERVICE_URL
            - name: IDENTITY_SERVICE_URL
              valueFrom:
                configMapKeyRef:
                  name: apollo-airlines-config
                  key: IDENTITY_SERVICE_URL
            - name: NOTIFICATION_SERVICE_URL
              valueFrom:
                configMapKeyRef:
                  name: apollo-airlines-config
                  key: NOTIFICATION_SERVICE_URL
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: apollo-airlines-secrets
                  key: JWT_SECRET
            - name: PORT
              valueFrom:
                configMapKeyRef:
                  name: apollo-airlines-config
                  key: PORT_BOOKING
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8082
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8082
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 2. The Label and Selector Contract

Look closely at lines 8–14 of `booking-dep.yaml`:

```yaml
  selector:
    matchLabels:
      app: booking
  template:
    metadata:
      labels:
        app: booking
```

:::important The Selector Contract
The Deployment's `.spec.selector.matchLabels` MUST match the Pod template's `.spec.template.metadata.labels`.

If these two blocks do not match, the Kubernetes API server will reject the manifest with a validation error because the Deployment controller would create Pods that it cannot track or own!
:::

Now examine the matching Service definition:

*Source: `stages/stage1/k8s/apps/booking/booking-svc.yaml`*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: booking
  namespace: apollo-airlines
spec:
  type: NodePort
  selector:
    app: booking
  ports:
    - port: 8082
      targetPort: 8082
      nodePort: 30082
```

Notice the Service's `.spec.selector`: `app: booking`.
The Service does not point to a Deployment name; it queries the cluster for **all ready Pods bearing the label `app: booking`**!

- `port: 8082`: The port the Service listens on inside the cluster.
- `targetPort: 8082`: The port on the container where traffic is forwarded.
- `nodePort: 30082`: The high port opened on every Kubernetes worker node, allowing your host machine to access the Service directly.

---

### 3. Decoupling Configuration: ConfigMaps and Secrets

Hardcoding environment variables inside container images or Deployment manifests makes configuration changes painful and leaks sensitive information into source control.

Kubernetes separates configuration into two dedicated primitives:

#### ConfigMaps (Non-Sensitive Configuration)

*Source: `stages/stage1/k8s/config/configmap.yaml`*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: apollo-airlines-config
  namespace: apollo-airlines
data:
  PORT_IDENTITY: "8080"
  PORT_FLIGHT: "8081"
  PORT_BOOKING: "8082"
  PORT_SEARCH: "8083"
  PORT_NOTIFICATION: "8084"
  PORT_FRONTEND: "3000"

  IDENTITY_DB: "identity"
  FLIGHT_DB: "flight"
  BOOKING_DB: "booking"

  VITE_IDENTITY_URL: "http://identity:8080"
  VITE_FLIGHT_URL: "http://flight:8081"
  VITE_BOOKING_URL: "http://booking:8082"
  VITE_SEARCH_URL: "http://search:8083"

  FLIGHT_SERVICE_URL: "http://flight:8081"
  IDENTITY_SERVICE_URL: "http://identity:8080"
  NOTIFICATION_SERVICE_URL: "http://notification:8084"

  REDIS_URL: "redis://redis:6379"
```

#### Secrets (Sensitive Credentials)

*Source: `stages/stage1/k8s/config/secrets.yaml`*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: apollo-airlines-secrets
  namespace: apollo-airlines
type: Opaque
stringData:
  POSTGRES_PASSWORD: "postgres"
  JWT_SECRET: "apollo-airlines-dev-secret-change-in-production"
```

:::warning Base64 Encoding Is Not Encryption!
Kubernetes Secrets store data as base64-encoded strings (`data`) or plain text during authoring (`stringData`). Base64 is an encoding format, NOT encryption! Anyone with read access to the namespace or etcd can decode base64 strings with `base64 -d`. In production, Secrets must be encrypted at rest in etcd and integrated with external KMS / Vault (explored in Stage 8).
:::

In `booking-dep.yaml`, we inject these values cleanly using:
- `valueFrom.configMapKeyRef`: Pulls a specific key from `apollo-airlines-config`.
- `valueFrom.secretKeyRef`: Pulls a specific credential from `apollo-airlines-secrets`.

---

### 4. Bounded Work: Database Bootstrap Jobs

Microservices often require one-time initialization tasks before they can serve traffic, such as creating database tables or inserting seed data.

Running migrations inside the application container entrypoint is risky: if 3 replicas start simultaneously, they may race to execute the same `CREATE TABLE` commands.

Kubernetes provides the **Job** resource (`batch/v1`) for tasks that must execute to completion and exit:

*Source: `stages/stage1/k8s/jobs/init-booking-db.yaml`*

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: init-booking-db
  namespace: apollo-airlines
spec:
  backoffLimit: 3
  template:
    metadata:
      labels:
        app: init-booking-db
    spec:
      serviceAccountName: init-booking-db
      containers:
        - name: init
          image: postgres:15-alpine
          command:
            - sh
            - -c
            - |
              set -eu
              attempt=0
              until pg_isready -h booking-db -U postgres; do
                attempt=$((attempt + 1))
                if [ "${attempt}" -ge 30 ]; then
                  echo "booking-db did not become ready" >&2
                  exit 1
                fi
                echo "Waiting for booking-db... (${attempt}/30)"
                sleep 2
              done
              psql -v ON_ERROR_STOP=1 -h booking-db -U postgres -d booking -f /init/init.sql
              echo "booking DB init done"
          env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: apollo-airlines-secrets
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: init-script
              mountPath: /init
      volumes:
        - name: init-script
          configMap:
            name: booking-init-script
      restartPolicy: Never
```

### Why this Job design works reliably:
1. **Polls with `pg_isready`**: The Job waits for the `booking-db` PostgreSQL service to accept TCP connections before attempting to run SQL commands.
2. **Mounts SQL from a ConfigMap**: `booking-init-script` mounts `stages/stage1/code/booking/init.sql` directly into `/init/init.sql`.
3. **`restartPolicy: Never`**: If the script fails, the container is not restarted infinitely in an uncontrollable loop; the Job controller retries up to `backoffLimit: 3` times.

---

### 5. Least-Privilege Workload Identity: ServiceAccounts

By default, Kubernetes mounts an API token into every Pod at `/var/run/secrets/kubernetes.io/serviceaccount/token`. If your application code is compromised, an attacker can use this token to query the Kubernetes API server!

None of the Apollo Airlines microservices need to interact with the Kubernetes API. Therefore, Stage 1 provisions 13 dedicated ServiceAccounts with token automount explicitly disabled:

*Source: `stages/stage1/k8s/config/serviceaccounts.yaml`*

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: booking
  namespace: apollo-airlines
automountServiceAccountToken: false
```

---

## 🧪 Hands-On Guided Exercises

### Exercise 1: Deploying Stage 1

- **Objective**: Build application images, load them into kind, and apply all Stage 1 manifests.
- **Starting Point**: Healthy `kind-apollo11` cluster from Ignition.
- **Instructions**:

```bash
cd Apollo11

# 1. Run the verified Stage 1 deploy script
bash stages/stage1/scripts/apply.sh

# 2. Inspect all deployed workloads in apollo-airlines
kubectl get deployments,statefulsets,jobs,pods,svc -n apollo-airlines
```

- **Expected Result**:
  - 10 Deployments report desired replicas available (`2/2` for apps, `1/1` for DBs).
  - 3 Jobs (`init-identity-db`, `init-flight-db`, `init-booking-db`) show `1/1 Completed`.
  - Services show `NodePort` mappings matching ports `30080`–`30084`.
- **Verification Script**:

```bash
bash stages/stage1/scripts/verify.sh
```

All 167 automated checks should pass!

---

### Exercise 2: Tracing the Ownership Tree

- **Objective**: Prove that the Deployment owns the ReplicaSet, and the ReplicaSet owns the Pods.
- **Starting Point**: Running Stage 1 cluster.
- **Instructions**:

```bash
# 1. Get the booking Deployment and note its name
kubectl get deployment booking -n apollo-airlines

# 2. Inspect the ReplicaSet created by the Deployment
kubectl get replicaset -n apollo-airlines -l app=booking

# 3. Read the ownerReferences metadata of one booking Pod
BOOKING_POD=$(kubectl get pods -n apollo-airlines -l app=booking -o jsonpath='{.items[0].metadata.name}')

kubectl get pod "${BOOKING_POD}" -n apollo-airlines -o jsonpath='{.metadata.ownerReferences}' | jq
```

- **Expected Result**:
  The Pod's `ownerReferences` points directly to `kind: ReplicaSet` and `name: booking-<hash>`.
  If you inspect the ReplicaSet's `ownerReferences`, it points to `kind: Deployment` and `name: booking`!
- **What Concept This Reinforces**:
  Kubernetes uses `ownerReferences` to maintain a strict hierarchy. Deleting the parent Deployment automatically garbage-collects child ReplicaSets and Pods.

---

### Exercise 3: Self-Healing in Action (Reconciliation Loop)

- **Objective**: Delete a Pod managed by a Deployment and observe immediate controller recreation.
- **Starting Point**: Stage 1 running with 2 booking replicas.
- **Instructions**:

```bash
# 1. List current booking pods with their UIDs
kubectl get pods -n apollo-airlines -l app=booking -o custom-columns='NAME:.metadata.name,UID:.metadata.uid'

# 2. Delete one of the booking pods
kubectl delete pod "${BOOKING_POD}" -n apollo-airlines

# 3. Immediately list booking pods again
kubectl get pods -n apollo-airlines -l app=booking -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,UID:.metadata.uid'
```

- **Expected Result**:
  Unlike Ignition (where deleting the bare Pod destroyed it permanently), the booking ReplicaSet noticed only 1 Pod existed instead of 2. It instantly commanded the kubelet to create a brand-new Pod with a new UID. At no point was the Service left without healthy endpoints!

---

### Exercise 4: Rolling Updates & Diagnosing `ImagePullBackOff`

- **Objective**: Trigger a broken rollout, diagnose `ImagePullBackOff`, verify service availability, and roll back.
- **Starting Point**: Healthy booking service responding at `http://localhost:30082/readyz`.
- **Instructions**:

```bash
# 1. Update the booking Deployment with a non-existent image tag
kubectl set image deployment/booking booking=apollo11/booking:v999-invalid -n apollo-airlines

# 2. Monitor rollout status
kubectl rollout status deployment/booking -n apollo-airlines --timeout=20s || true

# 3. Check Pod status
kubectl get pods -n apollo-airlines -l app=booking
```

- **Diagnosis (The Evidence Ladder)**:

```bash
# Check events on the failing Pod
BROKEN_POD=$(kubectl get pods -n apollo-airlines -l app=booking | grep -E "(ImagePullBackOff|ErrImagePull)" | awk '{print $1}')
kubectl describe pod "${BROKEN_POD}" -n apollo-airlines | grep -A 5 Events:
```

Events clearly state: `Failed to pull image "apollo11/booking:v999-invalid": rpc error: code = NotFound`.

- **Test Service Availability**:

```bash
# Even though the rollout is stuck, test user traffic!
curl -i http://localhost:30082/readyz
```

Notice that `curl` returns `HTTP 200 OK`!
Because Kubernetes uses rolling update strategy (`maxUnavailable: 25%`), it refused to terminate the old, healthy Pods while the new Pod failed to become Ready!

- **Recovery (Undo Rollout)**:

```bash
# 4. Roll back to the previous stable revision
kubectl rollout undo deployment/booking -n apollo-airlines

# 5. Confirm rollout completes
kubectl rollout status deployment/booking -n apollo-airlines
```

All Pods return to `Running 1/1` on `apollo11/booking:latest`.

---

### Exercise 5: The `emptyDir` Data Loss Drill

- **Objective**: Prove that `emptyDir` storage does not survive Pod replacement, setting up the motivation for Stage 3.
- **Starting Point**: Healthy databases in `apollo-airlines`.
- **Instructions**:

```bash
# 1. Insert a temporary test reservation into booking-db
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "
  INSERT INTO bookings (id, user_id, flight_id, seat_count, status, total_price)
  VALUES ('test-uuid-999', 'usr-1', 'flt-1', 1, 'CONFIRMED', 150.0);
"

# 2. Verify the record exists
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "SELECT id, status FROM bookings WHERE id='test-uuid-999';"

# 3. Delete the booking-db Pod to trigger a replacement
BOOKING_DB_POD=$(kubectl get pod -n apollo-airlines -l app=booking-db -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod "${BOOKING_DB_POD}" -n apollo-airlines
kubectl wait --for=condition=Ready pod -l app=booking-db -n apollo-airlines --timeout=60s

# 4. Re-query the database for the record
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "SELECT id, status FROM bookings WHERE id='test-uuid-999';"
```

- **Expected Result**:
  `test-uuid-999` is **gone**! `(0 rows)`.
- **Why Did We Lose Data?**
  In Stage 1, `booking-db-dep.yaml` mounts an `emptyDir` volume:
  ```yaml
  volumes:
    - name: pg-data
      emptyDir: {}
  ```
  `emptyDir` is allocated on the node's disk when a Pod is assigned and deleted when the Pod dies! For stateless apps (like `booking`), this is fine. For databases, this is unacceptable. In **Stage 3**, we will fix this permanently by introducing `StatefulSets` and `PersistentVolumeClaims`.

---

## 🏁 What You Learned

- How Deployments, ReplicaSets, and Pods collaborate to deliver self-healing workloads.
- How the reconciliation loop continuously aligns observed cluster state with declared desired state.
- How Services use label selectors to route traffic across dynamic Pod IP addresses.
- How ConfigMaps and Secrets externalize application settings and passwords.
- Why one-time database bootstrap tasks belong in `batch/v1` Jobs rather than application containers.
- How disabling token automount on ServiceAccounts implements defense-in-depth security.
- How rolling update strategies prevent downtime during failed deployments, and how to use `kubectl rollout undo`.
- Why `emptyDir` storage is ephemeral and cannot be used for stateful database storage.

---

## ✈️ Before Continuing: Checkpoint

Before moving to Stage 2, test your understanding:
1. What is the difference in responsibility between a Deployment and a ReplicaSet?
2. If a Service's `selector` has a typo (e.g. `app: boking`), what will `kubectl apply` do? What will happen to traffic?
3. Why does `kubectl set image` with an invalid tag not take down your existing application?
4. Why did `booking-db` lose its test record when its Pod was deleted?

Now that all 10 workloads are running inside the cluster, let's explore how Kubernetes routes traffic internally via CoreDNS and exposes services to the outside world through Ingress and the modern Gateway API!

👉 **Continue to [Stage 2: Guidance (Networking & Edge Access)](./stage-2)**
