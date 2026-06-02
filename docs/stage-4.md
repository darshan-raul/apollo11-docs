---
title: "Stage 4: Flight Control — Probes, Resource Limits, QoS"
description: "Configure health probes, set resource requests/limits, understand QoS classes, and use PodPriority for critical workloads."
---

# Stage 4: Flight Control

**Goal:** Configure health checks (startup, liveness, readiness probes), set CPU/memory resource requests and limits, understand Quality of Service classes, and use PodPriority.

---

## What You'll Learn

| Concept | What It Does |
|---|---|
| **startupProbe** | Ensures main container doesn't start until app is ready |
| **livenessProbe** | Restarts container if app becomes unresponsive |
| **readinessProbe** | Removes pod from Service endpoints until healthy |
| **Resource requests** | Guaranteed CPU/memory allocation |
| **Resource limits** | Maximum CPU/memory cap |
| **QoS classes** | Guaranteed, Burstable, BestEffort |
| **PodPriority + Preemption** | Schedule critical pods over less critical ones |

---

## Health Probes

### startupProbe

```yaml
startupProbe:
  httpGet:
    path: /healthz/startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 5
```

### livenessProbe

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

### readinessProbe

```yaml
readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

---

## Resource Requests and Limits

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"
```

| Field | Meaning |
|-------|---------|
| `requests.cpu` | Guaranteed allocation (scheduler uses this) |
| `limits.cpu` | Maximum CPU (throttled if exceeded) |
| `limits.memory` | OOM killed if exceeded |

---

## QoS Classes

| QoS Class | Condition | Eviction Priority |
|-----------|-----------|-------------------|
| **Guaranteed** | All containers have matching requests/limits | Last |
| **Burstable** | At least one container has requests | Medium |
| **BestEffort** | No resource requests or limits | First |

---

## PodPriority and Preemption

```yaml
spec:
  priorityClassName: high-priority
```

High-priority pods can preempt (evict) lower-priority pods to schedule.

---

## Key Takeaways

```
startupProbe:   Holds off liveness until app is ready
livenessProbe:  Restarts container if unresponsive
readinessProbe: Removes pod from Service if unhealthy

requests:  Guaranteed allocation (scheduler uses)
limits:    Maximum cap (CPU throttled, memory OOM)

QoS: Guaranteed > Burstable > BestEffort (eviction order)
```

---

## What's Next

Stage 5 introduces **Payload Integration** — packaging with Helm, customizing with Kustomize, CI/CD with GitHub Actions, and GitOps with ArgoCD.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.