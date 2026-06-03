---
title: "Stage 11: Towards Mars"
description: "CRDs and operators, k3s homelab, KEDA autoscaling, Backstage developer platform, Goldilocks cost optimization."
---

# Stage 11: Towards Mars

**Goal:** Extend Kubernetes beyond managed clusters — build custom controllers, homelab setups, event-driven scaling, and internal developer platforms.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| **Custom controllers** | Go + controller-runtime | Watch and reconcile custom resources |
| **Homelab Kubernetes** | k3s | Lightweight k8s on your own hardware |
| **Event-driven scaling** | KEDA | Scale based on Prometheus, Kafka, RabbitMQ |
| **Internal developer platform** | Backstage | Catalog services, docs, templates |
| **Cost optimization** | Goldilocks, Kubecost | Right-size resource requests |

---

## Custom Resource Definitions (CRDs) and Operators

Kubernetes is extensible — you can define your own resource types and write controllers to manage them.

### A simple CRD

```yaml
apiVersion: apollo11.dev/v1
kind: LibraryService
metadata:
  name: catalog
spec:
  serviceName: catalog
  replicas: 2
  database: catalog-postgres
```

### Operator pattern

An **operator** is a controller that watches your custom resources and manages the underlying k8s objects:

```
User creates LibraryService → Controller → Deployment + Service + PVC
```

### controller-runtime (Go)

```go
func (r *LibraryServiceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var libSvc apollo11v1.LibraryService
    if err := r.Get(ctx, req.NamespacedName, &libSvc); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Create or update Deployment, Service, etc.
    return ctrl.Result{}, nil
}
```

---

## k3s Homelab

k3s is a fully certified Kubernetes distribution that runs on a single binary (~60MB). Ideal for homelabs, edge, and IoT.

### Why k3s?

| Feature | k3s | Standard k8s |
|---------|-----|---|
| Binary size | ~60MB | ~100MB+ |
| Memory usage | ~512MB | ~2GB+ |
| Database | SQLite (built-in) | etcd (separate) |
| Installation | One command | Multi-step |

### Expose to the internet

**Option 1: Cloudflare Tunnel** (free)

```bash
cloudflared tunnel run apollo11-tunnel
```

**Option 2: Tailscale** (free for homelab)

```bash
tailscale up --accept-routes
```

---

## KEDA — Event-Driven Autoscaling

KEDA scales workloads based on external signals (queue depth, Kafka lag, Prometheus metrics) rather than just CPU/memory.

### Scale based on Prometheus

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: catalog-scaler
spec:
  scaleTargetRef:
    name: catalog
  minReplicaCount: 2
  maxReplicaCount: 20
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: http_requests_total
        threshold: "100"
```

### Scale based on queue depth

```yaml
    - type: rabbitmq
      metadata:
        queueName: notification-queue
        host: amqp://notification-redis:5672
        queueLength: "10"  # scale up when queue > 10
```

---

## Backstage — Internal Developer Platform

Backstage consolidates service catalogs, documentation, and scaffolding into a single portal.

### Install

```bash
helm install backstage bitnami/backstage -n backstage -f values.yaml
```

### Register a service

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: auth
  annotations:
    github.com/project-slug: darshan-raul/Apollo11
spec:
  type: service
  lifecycle: production
  owner: platform-team
  dependsOn:
    - component:auth-postgres
```

---

## Goldilocks — Right-size resource requests

Goldilocks queries the VPA (Vertical Pod Autoscaler) to recommend resource requests:

```bash
kubectl apply -f https://github.com/realtimeapps/Goldilocks/raw/main/deploy/kubernetes/all-in-one.yaml
goldilocks ns apollo11-apps
```

This generates recommended `resources.requests` for every Deployment based on actual usage patterns.

---

## Key Takeaways

```
CRDs + Operators: Extend k8s with custom resources and reconciliation loops
k3s:               Single-binary k8s for homelab/edge (~60MB, SQLite backend)
KEDA:              Scale on events (queue depth, Kafka, Prometheus) not just CPU
Backstage:         IDP — service catalog, docs, tech radar, plugins
Goldilocks:        VPA-based resource right-sizing recommendations
```

---

## What You've Built

13 stages from Docker Compose to production-grade Kubernetes — storage, networking, observability, scaling, security, GitOps, cloud provisioning, service mesh, and operators. You're ready to operate real production clusters.