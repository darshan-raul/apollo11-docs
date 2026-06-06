# Stage 1: Running apps on Kubernetes

Now that all services work with Docker Compose, it's time to run them on a local Kubernetes cluster.

## Kubernetes Distributions

| Distribution | Website |
| :--- | :--- |
| **k3d** | [k3d.io](https://k3d.io) — Kubernetes in Docker (what we use) |
| **Minikube** | [minikube.sigs.k8s.io](https://minikube.sigs.k8s.io/docs/start) |
| **Kind** | [kind.sigs.k8s.io](https://kind.sigs.k8s.io/docs/user/quick-start#creating-a-cluster) |
| **MicroK8s** | [microk8s.io](https://microk8s.io) |
| **k3s** | [k3s.io](https://k3s.io) |
| **Rancher Desktop** | [rancherdesktop.io](https://rancherdesktop.io) |

This course uses **k3d** (Kubernetes in Docker) — lightweight and fast to provision.

## Prerequisites

`k3d`, `kubectl`, and `docker` are needed. Install from the [Launchpad](./launchpad) section, then enter the devbox shell.

## Creating a k3d cluster

Create the cluster from the repo root:

```bash
cd Apollo11
k3d cluster create --config stages/stage1/k3d-config.yaml
```

Verify the cluster is running:

```bash
kubectl cluster-info --context k3d-apollo11
kubectl get nodes
```

### ~/.kube/config

k3d automatically updates your `~/.kube/config`. The context name matches the cluster name (`k3d-apollo11`). We'll revisit this file in Stage 8 when we cover RBAC.

### Run nginx as a first pod

Test the cluster with a throwaway nginx pod:

```bash
kubectl run nginx --image=nginx
kubectl get pods
```

Wait for it to be `Running`, then test port-forwarding:

```bash
kubectl port-forward pod/nginx 8000:80
# In another terminal:
curl http://localhost:8000
```

Clean up:

```bash
kubectl delete pod/nginx
```

---

## Pods, Deployments, ReplicaSets, and Services

### The Pod — smallest deployable unit

A **Pod** is a logical host for one or more containers that share the same network namespace and storage volumes.

**Why you don't run Pods directly:**

- **No self-healing** — if a bare Pod crashes, Kubernetes doesn't restart it
- **No scaling** — you manage each pod manually
- **No rolling updates** — replacing a pod means downtime
- **No declarative desired state** — you manually manage each instance

### ReplicaSet — self-healing (but not used directly)

A **ReplicaSet** ensures a specific number of identical Pods are always running. If a Pod dies, the ReplicaSet creates a replacement automatically.

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: identity
spec:
  replicas: 3
  selector:
    matchLabels:
      app: identity
  template:
    metadata:
      labels:
        app: identity
    spec:
      containers:
        - name: identity
          image: apollo11/identity:latest
```

**Why not use ReplicaSet directly?** It has no rolling-update or rollback capabilities. That's why we use Deployments.

### Deployment — the workhorse

A **Deployment** wraps a ReplicaSet and adds declarative updates, rolling updates, and rollbacks:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: identity
spec:
  replicas: 2
  selector:
    matchLabels:
      app: identity
  template:
    metadata:
      labels:
        app: identity
    spec:
      containers:
        - name: identity
          image: apollo11/identity:latest
          ports:
            - containerPort: 8080
```

Key capabilities:
- **Rolling updates** — replaces pods one-by-one with zero downtime
- **Rollbacks** — `kubectl rollout undo deployment/identity` reverts to the previous revision
- **Self-healing** — crashed pods are replaced automatically

### Services — stable network endpoint

Pods are ephemeral (IP changes on restart). A **Service** provides a stable DNS name and load-balances across matching pods:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: identity
spec:
  type: ClusterIP       # Internal only (covered in Stage 2)
  selector:
    app: identity
  ports:
    - port: 80
      targetPort: 8080
```

Other pods reach the identity service via `http://identity:80` — they never need to know pod IPs.

---

## Create the namespace

All resources live in the `apollo11` namespace:

```bash
cd stages/stage1/k8s
kubectl apply -f config/namespace.yaml
kubectl get namespaces
```

The repo uses Kustomize to compose all manifests:

```bash
cd stages/stage1/k8s
kubectl apply -k .
```

Or apply recursively (equivalent):

```bash
kubectl apply -R -f stages/stage1/k8s
```

This creates all of the following:

| Resource Type | Count | Examples |
|---|---|---|
| Namespace | 1 | `apollo11` |
| ConfigMap | 1 | service URLs, ports |
| Secret | 1 | DB passwords, JWT secret |
| ServiceAccount | 1 | for app pods |
| Deployment | 6 | identity, flight, booking, search, notification, frontend |
| StatefulSet | 4 | identity-db, flight-db, booking-db, redis |
| Service | 10 | 6 app ClusterIP + 4 infra ClusterIP |
| Job | 3 | init-identity-db, init-flight-db, init-booking-db |

Check everything is running:

```bash
kubectl get all -n apollo11
kubectl get pods -n apollo11
```

---

## Tools for Efficiency

### K9s — Terminal UI

Interactive cluster dashboard in your terminal:

```bash
k9s
```

- `:` then `deployments`, `services`, `pods`, `logs`
- Arrow keys to navigate, `Enter` to drill down
- `?` for the cheatsheet

### Kubectx — Context switcher

Switch between clusters:

```bash
kubectx                    # list all contexts
kubectx k3d-apollo11       # switch to local cluster
```

### Kubens — Namespace switcher

Set active namespace:

```bash
kubens                     # list all namespaces
kubens apollo11            # switch to apollo11 namespace
kubens -                   # back to previous
```

### Pro workflow

```bash
kubectx k3d-apollo11   # select cluster
kubens apollo11         # set namespace
k9s                      # launch dashboard
```

---

## Cleanup

Remove everything (test environments only):

```bash
kubectl delete -R -f stages/stage1/k8s
# or nukes the whole namespace:
kubectl delete ns apollo11
```

---

## What's Next

[Stage 2](./stage-2) — Kubernetes networking: DNS, Services, Ingress, NetworkPolicies, and Gateway API.