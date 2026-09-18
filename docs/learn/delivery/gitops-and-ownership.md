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

## Packaging vs. Reconciliation: Helm/Kustomize vs. Argo CD

Learners often wonder: *"If we already have Helm and Kustomize, why do we need Argo CD?"*

| Tool Type | Examples | Where it Runs | Core Responsibility |
|---|---|---|---|
| **Packaging & Rendering Engine** | Helm, Kustomize | Client-side (on your laptop or CI runner) | Takes templates or patches and turns them into raw Kubernetes YAML. Once applied, Helm exits; it does not monitor the cluster for unauthorized changes. |
| **GitOps Reconciliation Controller** | Argo CD, Flux | Cluster-side (inside Kubernetes) | Runs continuously in a control loop. It repeatedly polls Git, renders manifests using Helm/Kustomize, diffs against the live API, and **automatically reverts manual changes** (self-healing). |

---

## The "Local GitOps Paradox": How GitOps Works in a Local Lab

In enterprise environments, engineers push code to a central Git repository (GitHub/GitLab), and Argo CD pulls from that remote server.
However, in a local development lab on `kind`, learners face a natural puzzle:

> *"Argo CD runs inside my `kind` cluster container. It cannot read `/home/myuser/...` on my laptop, and I don't have write access to push commits to `https://github.com/darshan-raul/Apollo11.git`. How can I practice GitOps locally?"*

Apollo Airlines structures the local GitOps experience through two clean pathways:

1. **Demonstrating Automated Self-Healing (Default Lab Route):**
   - By default, Argo CD's `Application` manifest (`stages/stage5/argocd/applications/dev.yaml`) points to the public upstream repository (`https://github.com/darshan-raul/Apollo11.git`).
   - You don't need push access to test self-healing! In the lab, you manually tamper with the live cluster (e.g. `kubectl scale deployment/booking --replicas=5`). Argo CD detects the divergence (`OutOfSync`) and automatically scales it back to 1 replica to match Git!
2. **Local Iteration vs. The Personal Fork Route:**
   - **For rapid local development:** Test your YAML edits directly using `helm upgrade` or `kubectl apply -k` without waiting for Git.
   - **For full end-to-end GitOps:** Fork the `Apollo11` repository to your personal GitHub account. Set the environment variable `GITOPS_REPO=https://github.com/<your-username>/Apollo11.git`. Now, whenever you push commits to your personal fork, Argo CD will detect your remote commits and deploy them to your local kind cluster!

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
