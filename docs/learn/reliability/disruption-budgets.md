---
title: "Disruption budgets"
description: "Understand what voluntary disruptions are, how a PodDisruptionBudget constrains them, what it cannot protect against, and how the Eviction API enforces the budget during node maintenance."
---

# Disruption budgets

*Stage 4 · Flight Control*

Draining a node for routine kernel upgrades forcibly evicts its hosted containers. If all booking replicas reside on that single node, draining causes a sudden outage.

A **PodDisruptionBudget (PDB)** protects application availability by constraining concurrent voluntary disruptions.

---

## Voluntary vs. Involuntary disruptions

A PDB strictly governs **voluntary disruptions**:

- **Voluntary disruptions (PDB enforced)**:
  - `kubectl drain node` during host maintenance.
  - Cluster autoscaler downscaling excess nodes.
  - Manual evictions via the Kubernetes Eviction API.
- **Involuntary disruptions (PDB ignored)**:
  - Hardware power loss or sudden physical node crash.
  - Kernel panic or Out-of-Memory (`OOMKilled`) termination.
  - Forced manual deletion (`kubectl delete pod --force --grace-period=0`).

~~~mermaid
sequenceDiagram
  participant Drain as kubectl drain
  participant API as kube-apiserver
  participant PDB as PodDisruptionBudget
  participant RS as ReplicaSet
  Drain->>API: POST /eviction booking-pod-1
  API->>PDB: Check budget (minAvailable: 1, current ready: 2)
  PDB-->>API: Allowed (2-1 = 1 >= minAvailable)
  API->>Drain: 201 Created (eviction accepted)
  Note over RS: Creates replacement Pod
  Drain->>API: POST /eviction booking-pod-2
  API->>PDB: Check budget (minAvailable: 1, current ready: 1)
  PDB-->>API: Denied (1-1 = 0 < minAvailable)
  API->>Drain: 429 Too Many Requests
  Note over Drain: Waits for replacement\nto become Ready
  Drain->>API: POST /eviction booking-pod-2 (retry)
  API->>PDB: Check budget (current ready: 2 again)
  PDB-->>API: Allowed
  API->>Drain: 201 Created
~~~

*Diagram RL-06 — the Eviction API returns HTTP 429 when an eviction would violate the budget; drain retries until replacements become Ready.*

---

## Configuring availability budgets

PDBs express constraints using either minimum availability or maximum downtime:

- **`minAvailable: 1`**: Requires at least one healthy replica to remain online at all times.
- **`maxUnavailable: 1`**: Allows at most one replica to be simultaneously evicted.
- **Percentage values (`minAvailable: "50%"`)**: Scales dynamically as the workload expands.

~~~yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: booking-pdb
  namespace: apollo-airlines-apps
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: booking
~~~

---

## The stuck drain deadlock trap

A common operational failure occurs when replacement Pods cannot schedule:
- An operator initiates a node drain.
- Pod 1 is evicted, leaving Pod 2 running (`minAvailable: 1` maintained).
- Pod 1's replacement is stuck in `Pending` due to insufficient cluster CPU.
- The PDB blocks eviction of Pod 2, returning HTTP 429 indefinitely.
- The node drain hangs until cluster capacity is increased.

---

## Evidence and limits

- **1. Inspect allowed disruptions**: Verify how many Pods can currently be evicted:
  ```bash
  kubectl get pdb -n apollo-airlines-apps
  ```
- **2. PDB status details**:
  ```bash
  kubectl describe pdb booking-pdb -n apollo-airlines-apps
  ```
- **3. Simulate node drain**: Safely test drain behavior without impacting workloads:
  ```bash
  kubectl drain apollo11-worker --dry-run=client --ignore-daemonsets --delete-emptydir-data
  ```
