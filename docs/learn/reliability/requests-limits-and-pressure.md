---
title: "Requests, limits, and pressure"
description: "Understand how resource requests affect scheduling and HPA calculations, how limits affect runtime behavior, what QoS classes determine, and what node pressure events actually look like."
---

# Requests, limits, and pressure

*Stage 4 · Flight Control*

Containers share physical node hardware. Without resource boundaries, a runaway memory leak in one service can crash unrelated critical databases on the same host.

Kubernetes governs resource allocations through requests, limits, and eviction policies.

---

## Requests vs. Limits: scheduling vs. runtime enforcement

~~~mermaid
flowchart LR
  PodSpec["booking Pod\nresources.requests.cpu: 100m\nresources.requests.memory: 128Mi"] -->|Scheduler checks| NodeCapacity["apollo11-worker\nAllocatable CPU: 1800m\nAllocatable memory: 3.5Gi"]
  NodeCapacity -->|sum of scheduled requests| Booked["Already booked:\ncpu: 1200m, memory: 2Gi"]
  Booked -->|100m + 128Mi fits| Schedule["Scheduler assigns Pod to node"]
~~~

*Diagram RL-03 — the scheduler uses requests to determine fit; node capacity is booked by requests, not live usage.*

- **Requests (`resources.requests`)**:
  - **Scheduling contract**: The minimum CPU and memory guaranteed to the Pod.
  - **Autoscaler denominator**: Used by HPA to calculate current CPU utilization percentages (`actual_cpu / requested_cpu`).
- **Limits (`resources.limits`)**:
  - **Runtime ceiling**: The maximum resource consumption permitted by the Linux kernel cgroups.
  - **CPU exceeding limit**: Throttled by CFS scheduler; application experiences latency spikes, but is not killed.
  - **Memory exceeding limit**: Terminated immediately by the kernel Out-of-Memory killer (`OOMKilled`).

---

## Understanding Quality of Service (QoS) classes

Kubernetes infers a QoS class based on your configuration:

- **`Guaranteed`**:
  - Condition: `requests == limits` for both CPU and memory across all containers.
  - Eviction priority: Lowest risk; evicted last during node resource starvation.
- **`Burstable`**:
  - Condition: At least one container specifies requests or limits, but does not qualify as Guaranteed.
  - Eviction priority: Moderate risk.
- **`BestEffort`**:
  - Condition: No requests or limits declared.
  - Eviction priority: Highest risk; terminated first when node feels pressure.

> **Operational warning**: QoS class is not an absolute eviction shield. A `Guaranteed` Pod consuming significantly more memory than requested will still be targeted before an idle `BestEffort` Pod.

---

## Evidence and limits

- **1. Check QoS classification**:
  ```bash
  kubectl get pod <pod-name> -n apollo-airlines-apps -o jsonpath='{.status.qosClass}'
  ```
- **2. Detect OOMKilled events**:
  ```bash
  kubectl describe pod <pod-name> -n apollo-airlines-apps | grep -E "OOMKilled|Reason"
  ```
- **3. Node resource pressure**: Inspect node memory and disk pressure flags:
  ```bash
  kubectl describe node apollo11-worker | grep -A 5 "Conditions:"
  ```
- **4. Live resource consumption**:
  ```bash
  kubectl top pods -n apollo-airlines-apps --containers
  ```
