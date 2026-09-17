---
title: "Scheduling and placement"
description: "Understand how the scheduler evaluates node fitness, what Pending actually means in different situations, and how taints, tolerations, affinity, and topology spread work together."
---

# Scheduling and placement

*Stage 4 · Flight Control*

The Kubernetes `kube-scheduler` assigns unscheduled Pods (`spec.nodeName` empty) to feasible cluster nodes. 

Placement decisions follow a deterministic multi-stage algorithm rather than arbitrary round-robin assignment.

---

## The three-phase scheduling lifecycle

~~~mermaid
flowchart TD
  Unscheduled["Unscheduled Pod: booking\nrequests: cpu=100m, memory=128Mi\naffinity: node-role=worker"] --> Filter
  Filter["Filter phase\nRemove infeasible nodes:\n- Insufficient resources\n- Missing required labels\n- Untolerated taints\n- Topology constraint violations"] --> Score
  Score["Score phase\nRank remaining nodes:\n- Least requested CPU/memory\n- Topology spread preference\n- Node affinity weight"] --> Bind
  Bind["Bind: write nodeName to Pod spec\n(atomic API write)"] --> Kubelet
  Kubelet["Kubelet on chosen node\nStarts the container"]
~~~

*Diagram RL-04 — the scheduler filters infeasible nodes before scoring feasible ones; binding writes nodeName.*

- **1. Filtering (Predicates)**:
  - Eliminates all nodes incapable of hosting the Pod (insufficient CPU/RAM, untolerated taints, missing node affinity labels).
- **2. Scoring (Priorities)**:
  - Ranks remaining feasible nodes using algorithms such as `NodeResourcesLeastAllocated` or topology spread weights.
- **3. Binding**:
  - Atomically writes the winning node's name to `spec.nodeName`, triggering the node's local kubelet to pull images and boot containers.

---

## What a `Pending` status actually indicates

A `Pending` Pod indicates placement constraints have not been met:

| Symptom / Reason | Underlying Cause | Remediation |
|---|---|---|
| **`Insufficient cpu/memory`** | Total node requests exceed allocatable capacity | Add node capacity or scale down workloads |
| **`Untolerated taint`** | Node has taint (e.g. `dedicated=search:NoSchedule`) | Add matching toleration to Pod spec |
| **`Node affinity mismatch`** | Pod requires label not present on any node | Label the target nodes |
| **`Unbound PVC`** | Storage provisioner waiting on first consumer | Investigate PVC binding status |

---

## Taints, tolerations, and affinity controls

- **Taints & Tolerations**:
  - **Taint on Node**: Repels Pods (`kubectl taint nodes node1 dedicated=db:NoSchedule`).
  - **Toleration on Pod**: Allows the Pod to schedule on tainted nodes.
- **Node Affinity**:
  - Attracts Pods to nodes with matching labels (`kubernetes.io/os=linux`).
  - `requiredDuringSchedulingIgnoredDuringExecution`: Strict hard requirement.
  - `preferredDuringSchedulingIgnoredDuringExecution`: Soft preference.
- **Topology Spread Constraints**:
  - Distributes replicas evenly across failure domains (racks, availability zones, hostnames) to prevent single-point-of-failure concentration (`maxSkew: 1`).

---

## Evidence and limits

- **1. Scheduling failure events**: Inspect why the scheduler rejected nodes:
  ```bash
  kubectl describe pod <pod-name> -n apollo-airlines-apps | grep -A 10 Events:
  ```
- **2. Node allocation breakdown**: Review allocatable resources per node:
  ```bash
  kubectl describe node apollo11-worker | grep -A 10 "Allocated resources"
  ```
- **3. Active node taints**:
  ```bash
  kubectl get nodes -o custom-columns='NAME:.metadata.name,TAINTS:.spec.taints'
  ```
