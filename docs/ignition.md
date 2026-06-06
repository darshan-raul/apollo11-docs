---
title: "Ignition — First Kubernetes Cluster"
description: "Set up a local kind Kubernetes cluster, understand its components, and run your first Pod. Compare local k8s options and learn why kind is the standard choice."
---

# Ignition — First Kubernetes Cluster

**Goal:** Spin up a local Kubernetes cluster using kind, verify it works, and launch your first Pod.

## What is Kubernetes?

Kubernetes (k8s) is a container orchestrator — it manages when and where containers run across a cluster of machines.

The problem it solves: you have dozens of containers making up an application. You need to:
- Schedule them across nodes
- Keep them running (restart crashed containers)
- Scale them up/down
- Expose them to the network
- Manage config and secrets separately from container images
- Roll out updates without downtime

Docker handles **one machine**. Kubernetes handles **a cluster of machines** and treats them as a single compute resource.

## The Local Kubernetes Landscape

There are several ways to run Kubernetes on your laptop:

| Tool | How it Works | Best For |
|---|---|---|
| **kind** | k8s nodes as Docker containers | CNCF conformance testing, local dev — **what we use** |
| **k3d** | k3s (lightweight k8s) running in Docker containers | Fast multi-cluster dev, CI |
| **minikube** | Single-node k8s in a VM (VirtualBox, Hyper-V, etc.) | Windows users, simple setups |
| **microk8s** | k8s installed as a snap package | Ubuntu desktop |
| **k3s** | Lightweight k8s binary, no Docker required | IoT, edge, ARM devices |
| **Rancher Desktop** | k3s or k3d bundled with a desktop app | macOS users who want a GUI |

### Why We Use kind

For this curriculum, we use **kind** (Kubernetes in Docker) because:

- It's the officially supported tool for CNCF conformance testing
- It runs master + worker nodes as plain Docker containers — no VM overhead
- `kind` is what the Apollo11 build scripts use to load images
- It works identically across Linux, macOS, and Windows
- Single binary, no install dependencies

> kind would be ideal if we were testing Kubernetes itself (CNCF conformance testing), but for daily development and learning, kind is the standard local dev tool.

## Prerequisites

- **Docker** installed and running (`docker --version`)
- **kubectl** installed (`brew install kubectl` or via your package manager)
- **kind** installed (see below)
- ~4GB RAM available for the cluster

### Install kind

> Apollo11 uses **Devbox** to manage all toolchain dependencies. Run `devbox shell` first — it loads `docker`, `kubectl`, `kind`, `helm`, and all other tools defined in `devbox.json` automatically. You don't need to install them manually.

```bash
# 1. Enter the Devbox environment (loads all tools)
devbox shell

# 2. Verify tools are available
docker --version
kubectl version --client
kind version

# 3. Create the cluster
kind create cluster --name apollo11
kubectl cluster-info
kubectl get nodes
```

Expected output:
```
Creating cluster "apollo11" ...
 ✓ Ensuring node image (kindest/node:v1.29.0) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🖧
 ✓ Installing the Storage Operator 🐻‍❄️
Set kubectl context to "kind-apollo11"
...

Kubernetes control plane is running at https://127.0.0.1:port
CoreDNS is running at https://127.0.0.1:port/api/v1/namespaces/kube-system/services/kube-dns:dns

kubectl get nodes
NAME                        STATUS   ROLES           AGE   VERSION
kind-apollo11-control-plane   Ready    control-plane   2m    v1.29.0
```

kind automatically updates your `~/.kube/config`. The context name is `kind-apollo11`:

```bash
# See all contexts
kubectl config get-contexts

# Switch to our cluster
kubectl config use-context kind-apollo11
```

### 2. Inspect the cluster

```bash
# Check component statuses (scheduler, etcd, controller-manager)
kubectl get componentstatuses

# See all available resource types
kubectl api-resources

# Get cluster info
kubectl cluster-info
```

### 3. Run your first Pod imperatively

```bash
kubectl run apollo-shell --image=alpine --restart=Never -- sh -c "echo 'hello from k8s'"
kubectl get pods
kubectl logs apollo-shell
kubectl exec apollo-shell -- cat /etc/os-release
```

### 4. Write a Pod manifest (declarative)

```yaml
# stages/ignition/pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: apollo-shell
  labels:
    app: shell
    stage: ignition
spec:
  containers:
    - name: shell
      image: alpine:latest
      command: ["sh", "-c", "echo 'hello from k8s' && sleep 3600"]
      resources:
        limits:
          memory: "64Mi"
          cpu: "250m"
        requests:
          memory: "32Mi"
          cpu: "100m"
```

```bash
kubectl apply -f pod.yaml
kubectl get pods
kubectl describe pod apollo-shell
```

### 5. Inspect a running Pod

```bash
# Watch pod status live
kubectl get pods -w

# See which node it's running on
kubectl get pods -o wide

# Get full YAML
kubectl get pod apollo-shell -o yaml

# Get previous logs (before restart)
kubectl logs apollo-shell --previous

# Execute into the container
kubectl exec -it apollo-shell -- sh
```

### 6. Clean up

```bash
kubectl delete pod apollo-shell
kind delete cluster --name apollo11
```

## Cluster Architecture

Every Kubernetes cluster has the same core components, regardless of whether it runs on AWS EKS or locally via kind:

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ kube-       │  │ kube-        │  │    etcd        │  │
│  │ apiserver   │  │ controller-  │  │ (key-value     │  │
│  │ (REST API)  │  │ manager      │  │  store)        │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                  │           │
│  ┌──────▼─────────────────▼──────────────────▼────────┐  │
│  │              kube-scheduler                         │  │
│  │         (assigns Pods to nodes)                    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Data Plane                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Worker Node                         │    │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │    │
│  │  │ kubelet │  │ kube-    │  │    CNI         │  │    │
│  │  │ (agent) │  │ proxy    │  │ (bridge/host)  │  │    │
│  │  └─────────┘  └──────────┘  └────────────────┘  │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐   │    │
│  │  │  Pod: nginx  Pod: redis  Pod: apollo-api  │   │    │
│  │  │  [container]  [container]  [container]    │   │    │
│  │  └──────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

| Component | What it does |
|---|---|
| kube-apiserver | REST API entry point for all cluster operations |
| etcd | Distributed key-value store for cluster state |
| kube-controller-manager | Runs controllers (replication, endpoints, namespaces, etc.) |
| kube-scheduler | Assigns Pods to nodes based on resource requests |
| kubelet | Agent on each node — ensures containers are running as specified |
| kube-proxy | Manages network rules on each node (Pod-to-Pod communication) |
| CNI | Container Network Interface — provides Pod networking |

## Essential kubectl Commands

```bash
# Cluster info
kubectl cluster-info
kubectl get nodes
kubectl describe node <node-name>

# Pods
kubectl get pods                    # list pods in default namespace
kubectl get pods -A                 # list pods in ALL namespaces
kubectl get pods -o wide            # more columns (node, IP)
kubectl describe pod <pod-name>
kubectl logs <pod-name>
kubectl logs <pod-name> --previous  # logs before last restart
kubectl exec -it <pod-name> -- sh   # interactive shell

# Apply / Delete
kubectl apply -f manifest.yaml      # create or update
kubectl delete -f manifest.yaml    # delete resources defined in file
kubectl delete pod <pod-name>      # delete single pod

# Dry-run (validate without applying)
kubectl apply -f manifest.yaml --dry-run=server

# Imperative (quick commands)
kubectl run nginx --image=nginx    # create a pod
kubectl expose pod nginx --port=80  # create a service
kubectl scale deployment nginx --replicas=3

# Context and namespace
kubectl config get-contexts        # show all contexts
kubectl config use-context <name>  # switch context
kubectl get namespaces
kubectl get pods -n <namespace>
```

## Key Concepts

- **Pods are fragile** — they can crash, be evicted, or rescheduled. Don't attach storage directly to pods; use PersistentVolumes.
- **Imperative** = "do this right now" (`kubectl run`, `kubectl expose`). Good for debugging.
- **Declarative** = "this is what I want" (YAML files with `kubectl apply`). Good for reproducibility.
- **Why Pods alone aren't enough** — if a Pod crashes, Kubernetes won't restart it automatically unless you use a controller like a Deployment.

## What's Next

Once the cluster is verified working, move to **Stage 1: Launchpad** where all 11 Apollo Airlines services are deployed using Deployments, ConfigMaps, and Secrets.