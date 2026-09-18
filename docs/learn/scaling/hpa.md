---
title: "Horizontal Pod Autoscaling"
description: "Understand how the HPA controller chain works from metrics pipeline through replica recommendation to Deployment update, why resource requests determine what CPU utilization means, and what the autoscaler cannot create."
---

# Horizontal Pod Autoscaling

*Stage 7 · Orbital Maneuvering*

When airline ticket sales launch, search traffic spikes tenfold. Manually adjusting replica counts is slow and reactive.

A **HorizontalPodAutoscaler (HPA)** automatically adjusts Deployment replica counts based on observed CPU utilization or custom metric thresholds.

---

## The HPA controller feedback loop

~~~mermaid
flowchart LR
  Prom["Prometheus\ncollects CPU metrics\nvia cAdvisor + node-exporter"] --> MetricsAPI["metrics-server\nor Prometheus Adapter\nexposes metrics.k8s.io API"]
  MetricsAPI --> HPA["HPA controller\nevaluates target utilization\ncomputes desired replicas"]
  HPA -->|updates| Dep["Deployment\nspec.replicas = N"]
  Dep --> RS["ReplicaSet\ncreates N Pods"]
  RS -->|schedules on| Node["Worker node\n(must have capacity)"]
~~~

*Diagram SC-03 — the HPA reads metrics via the metrics API, evaluates target ratios, and writes updated replica targets to the Deployment.*

- **1. Metrics Pipeline**: `metrics-server` aggregates container CPU and memory metrics from node kubelets.
- **2. Recommendation Algorithm**: Evaluates current utilization against target ratio:
  ```text
  Desired Replicas = ceil( Current Replicas * ( Current Metric / Target Metric ) )
  ```
- **3. Deployment Scale**: Writes new replica values to the Deployment controller.

---

## Why resource requests determine autoscaling correctness

HPA evaluates CPU utilization as a percentage of **requested CPU**:
```text
Utilization % = ( Actual CPU Usage / Requested CPU ) * 100
```

| Actual CPU | Requested CPU | Calculated Utilization | HPA reaction (Target: 80%) |
|---|---|---|---|
| **80m** | 100m | **80%** | Stable; no scale |
| **80m** | 500m | **16%** | Erroneously scales *down* |
| **80m** | 50m | **160%** | Rapidly scales *up* |

> **Critical rule**: Resource requests are not optional decorations. Without accurate requests, HPA calculations are mathematically meaningless.

---

## Scale-down stabilization window

~~~mermaid
flowchart LR
  R1[Recommendation: 10 replicas] --> History[Recent recommendation history]
  R2[Recommendation: 7 replicas] --> History
  R3[Recommendation: 4 replicas] --> History
  History --> Window{Within downscale window?}
  Window -->|yes| Safe[Choose highest recent recommendation: 10]
  Window -->|after older values expire| Lower[Allow a lower desired count]
~~~

*Diagram SC-05 — downscale stabilization retains recent recommendations and
uses the highest relevant value instead of sleeping for a fixed period.*

- **Flapping hazard**: Rapidly alternating between adding and removing Pods when traffic fluctuates.
- **Stabilization window (`stabilizationWindowSeconds: 300`)**:
  - Remembers the highest recommended replica count over the preceding 5 minutes.
  - Ensures Pods are not prematurely terminated during brief traffic dips.

---

## Evidence and limits

- **1. HPA operational status**: Inspect current vs. target metric values:
  ```bash
  kubectl get hpa search -n apollo-airlines-apps
  ```
- **2. Detailed evaluation events**: Review scaling decisions:
  ```bash
  kubectl describe hpa search -n apollo-airlines-apps
  ```
- **3. Watch real-time replica scaling**:
  ```bash
  kubectl get pods -n apollo-airlines-apps -l app=search -w
  ```
