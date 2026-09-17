---
title: "GitOps and ownership"
description: "Understand how a GitOps controller compares Git with the live cluster, what sync and health mean independently, and why clear ownership boundaries prevent reconciliation conflicts."
---

# GitOps and ownership

*Stage 5 · Payload Integration*

Applying manual hotfixes via `kubectl set image` creates an immediate conflict with automated delivery systems. A GitOps controller will observe the divergence between Git and the live cluster and overwrite the manual hotfix on its next reconciliation cycle.

GitOps establishes **Git as the sole source of truth** for declarative cluster state.

---

## The GitOps reconciliation cycle

~~~mermaid
flowchart LR
  Git["Git repository\n(single source of truth)"] -->|Declares desired state| ArgoApp["Argo CD Application\nwatches the repo"]
  ArgoApp -->|Renders| Manifests["Kubernetes manifests\n(Helm / Kustomize output)"]
  ArgoApp -->|Computes diff| Cluster["Live cluster state"]
  ArgoApp -->|Sync: applies diff| Cluster
  Cluster -->|Reports health| ArgoApp
~~~

*Diagram DL-03 — Argo CD continuously reconciles Git declarations against live cluster resources.*

- **1. Watch**: Argo CD monitors a specified Git branch for commit updates.
- **2. Render**: Generates pure manifests using Helm or Kustomize.
- **3. Compare**: Computes differences between desired Git YAML and live API resources.
- **4. Synchronize**: Applies changes and reverts out-of-band cluster edits.

---

## Decoupling Sync Status from Health Status

Argo CD separates desired-state alignment from runtime health:

| Status combination | What it means | Action required |
|---|---|---|
| **`Synced` + `Healthy`** | Live cluster matches Git, and all workloads are green | None; normal operating state |
| **`Synced` + `Degraded`** | Cluster matches Git, but a Pod is crashing (`CrashLoopBackOff`) | Debug the application; Git config is applied correctly |
| **`OutOfSync` + `Healthy`** | Cluster is running healthy, but differs from Git | Merge Git changes or trigger manual sync |
| **`OutOfSync` + `Degraded`** | Cluster differs from Git and resources are failing | Fix Git configuration and reconcile cluster |

---

## Resolving multi-controller ownership conflicts

When multiple automation systems (e.g. HPA, manual scripts, and Argo CD) write to the same field, the cluster oscillates between intentions:

- **HPA replica counts**: Use Argo CD's `ignoreDifferences` so GitOps does not override dynamic autoscaling replica values.
- **Strict single authority**: Forbid direct cluster mutation rights; route all environment changes through Git pull requests.

---

## Evidence and limits

- **1. Application sync and health check**:
  ```bash
  kubectl get application apollo-airlines -n argocd
  ```
- **2. Review live differences**:
  ```bash
  argocd app diff apollo-airlines
  ```
- **3. Trigger manual sync**:
  ```bash
  argocd app sync apollo-airlines
  ```
