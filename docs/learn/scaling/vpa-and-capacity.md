---
title: "VPA and capacity planning"
description: "Understand what VPA's recommendation mode provides, how to use it without causing HPA conflicts, and what neither autoscaler can do without physical node capacity."
---

# VPA and capacity planning

*Stage 7 · Orbital Maneuvering*

While the Horizontal Pod Autoscaler adjusts the number of replicas, the **Vertical Pod Autoscaler (VPA)** optimizes the CPU and memory requests allocated to each individual container.

---

## What the VPA Recommender provides

~~~mermaid
flowchart LR
  Pods["search Pods\n(actual CPU/memory usage)"] -->|Observed by| VPA["VPA recommender\n(analyses usage history)"]
  VPA -->|"updateMode: Off"| Rec["VPA status.recommendation:\ncpu: 150m (was: 100m)\nmemory: 512Mi (was: 256Mi)"]
  Rec -->|Read by| Engineer["Engineer\n→ Updates Deployment requests\n→ Runs k6 baseline"]
  Engineer -->|Improved requests| HPA["HPA\n(now has accurate denominator)"]
~~~

*Diagram SC-04 — in recommendation-only mode, VPA observes real resource consumption and outputs suggestions for human review.*

- **Continuous monitoring**: Tracks historical memory peaks and CPU percentiles.
- **Three recommended tiers**:
  - **`lowerBound`**: Minimum allocation to prevent CPU starvation.
  - **`target`**: Ideal baseline request based on steady-state traffic.
  - **`upperBound`**: Maximum limit recommended to absorb unexpected spikes without triggering `OOMKilled`.

---

## Operating modes: why `updateMode: "Off"` is safest

| Mode | Behavior | Risk Level |
|---|---|---|
| **`Off`** (Apollo standard) | Computes recommendations without mutating Pods | Zero risk; human reviews before applying |
| **`Initial`** | Assigns values only when new Pods are first created | Low; existing running Pods are not restarted |
| **`Auto` / `Recreate`** | Forcibly evicts running Pods to apply new limits | High; disrupts active traffic and causes rolling restarts |

---

## Resolving the HPA vs. VPA conflict

Running HPA and VPA concurrently on the same CPU metric causes a destructive race condition:
- 1. CPU rises → HPA scales out additional replicas.
- 2. Workload distributes → CPU per Pod drops.
- 3. VPA interprets lower CPU as over-provisioning → shrinks CPU requests.
- 4. Lower CPU request artificially inflates HPA utilization percentage → HPA scales out again.

> **Operational rule**: Never run HPA and VPA simultaneously in `Auto` mode on CPU. Use VPA in `Off` mode to determine baseline resource sizing, and configure HPA to manage live horizontal scaling.

---

## Evidence and limits

~~~mermaid
flowchart LR
  Metric[Demand metric rises] --> HPA[HPA requests more replicas]
  HPA --> Deploy[Deployment creates Pods]
  Deploy --> Pending[Pods remain Pending: no suitable capacity]
  Pending --> NodeScale[Node autoscaler may add a suitable node]
  NodeScale --> Schedule[Scheduler places Pods]
  Schedule --> Ready[Readiness makes new capacity usable]
  Constraint[Impossible affinity, quota, or zonal constraint] -.can block.-> NodeScale
~~~

*Diagram SC-06 — HPA can request Pods, but scheduler and node capacity determine
whether those replicas can run and become ready.*

- **1. Inspect VPA recommendations**:
  ```bash
  kubectl get vpa search -n apollo-airlines-apps -o yaml
  ```
- **2. Compare recommendations against live requests**:
  ```bash
  kubectl top pods -n apollo-airlines-apps -l app=search
  ```
- **3. Check for VPA evictions**:
  ```bash
  kubectl get events -n apollo-airlines-apps --field-selector reason=EvictedByVPA
  ```
