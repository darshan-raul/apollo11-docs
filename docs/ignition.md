---
title: "Ignition — First Kubernetes Cluster"
description: "Launch a kind cluster, run your first Pod, and learn kubectl basics. A deep beginner tutorial."
---

# Ignition — First Kubernetes Cluster

**Goal:** Spin up a local Kubernetes cluster, understand its components, and run your first Pod — all from scratch.

---

## What is Kubernetes?

Before we begin, let's understand what Kubernetes (k8s) is and why it exists.

**The problem:** You have 10 microservices that need to communicate. Each runs multiple replicas for reliability. They need to scale when traffic increases and restart when they crash. Manually managing this on dozens of servers is a nightmare.

**The solution:** Kubernetes is a **container orchestrator**. You declare what you want (3 replicas of my web app), and Kubernetes constantly works to make that happen.

---

## What is kind?

**kind** (Kubernetes IN Docker) is a tool for running local Kubernetes clusters using Docker containers as "nodes."

In a **real** Kubernetes cluster (like EKS, GKE), each component runs on separate machines. **kind simulates this** by running everything in a single Docker container on your laptop.

---

## Step 1: Install kind

### Prerequisites

- **Docker** installed and running
- **kubectl** installed (Kubernetes CLI)

### Install kind

```bash
# On Linux (amd64)
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# On Mac
brew install kind

# Verify
kind version
```

### Install kubectl

```bash
# On Linux
curl -Lo ./kubectl "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl

# On Mac
brew install kubectl

# Verify
kubectl version --client
```

---

## Step 2: Create Your First Cluster

### Create a single-node cluster

```bash
kind create cluster --name apollo11
```

**Expected output:**
```
Creating cluster "apollo11" ...
 ✓ Ensuring node image (kindest/node:v1.27.3) 
 ✓ Preparing nodes 
 ✓ Writing configuration 
 ✓ Starting control-plane 
 ✓ Installing CNI 
 ✓ Installing default storage class 
Set kubectl context to "kind-apollo11"
```

### Verify the cluster

```bash
# Check cluster info
kubectl cluster-info

# List nodes (in kind, you have 1 node - the control-plane)
kubectl get nodes
```

**Expected output:**
```
NAME                 STATUS   ROLES           AGE   VERSION
kind-control-plane   Ready    control-plane   2m   v1.27.3
```

---

## Step 3: Explore the Cluster Components

```bash
# Check core Kubernetes components
kubectl get componentstatuses

# Get all pods in the cluster
kubectl get pods -A
```

---

## Step 4: Run Your First Pod (Imperative)

```bash
kubectl run apollo-shell \
  --image=alpine:latest \
  --restart=Never \
  -- sh -c "echo 'hello from k8s' && sleep 3600"
```

### Check the pod

```bash
kubectl get pods
kubectl logs apollo-shell
kubectl exec -it apollo-shell -- sh
```

---

## Step 5: Write a Pod Manifest (Declarative)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: apollo-shell
  labels:
    app: shell
spec:
  containers:
    - name: shell
      image: alpine:latest
      command: ["sh", "-c", "echo 'hello from k8s' && sleep 3600"]
```

Apply:
```bash
kubectl apply -f pod.yaml
kubectl describe pod apollo-shell
```

---

## Cluster Architecture

| Component | What It Does |
|---|---|
| **kube-apiserver** | REST API entry point for all cluster operations |
| **etcd** | Distributed key-value store containing the entire cluster state |
| **kube-controller-manager** | Runs controller loops (replication, endpoints, etc.) |
| **kube-scheduler** | Assigns Pods to nodes |
| **kubelet** | Agent on each node, ensures containers are running |
| **CNI** | Creates the network namespace for each pod |

---

## Essential kubectl Commands

```bash
kubectl get pods                    # List pods
kubectl apply -f <file.yaml>        # Create/update resources
kubectl describe pod <name>          # Detailed info
kubectl logs <name>                 # View logs
kubectl exec -it <name> -- sh       # Shell into pod
kubectl delete -f <file.yaml>      # Delete resources
```

---

## Key Takeaways

```
kind create cluster --name apollo11     # Create a local cluster
kubectl get pods                         # List pods
kubectl apply -f pod.yaml                # Create from YAML
kubectl describe pod <name>              # Detailed info
kubectl logs <name>                     # View logs
kubectl exec -it <name> -- sh           # Shell into pod

Pod = smallest deployable unit (one or more containers)
Deployment = manages Pods (self-healing, scaling, rolling updates)
The reconciliation loop keeps actual state matching desired state
```

---

## What's Next

**Stage 1: Liftoff** — Deploy all 11 application services using Deployments, ConfigMaps, Secrets, and Jobs.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.