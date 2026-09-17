---
title: "Rollouts and rollback"
description: "Understand how a Deployment template change becomes a controlled handover between versions, what readiness gates, and why rolling back is not undoing."
---

# Rollouts and rollback

*Stage 1 · Liftoff*

When a new container image is released, tearing down all existing Pods simultaneously causes an immediate service outage. A Deployment replaces Pods gradually through a controlled rolling update, preserving service availability while transitioning traffic between versions.

---

## How template changes trigger rolling updates

Any modification to `spec.template` (image tag, environment variable, or probe configuration) initiates a new rollout:

- **1. New ReplicaSet created**: The Deployment controller spins up a secondary ReplicaSet representing the new template version.
- **2. Coexistence**: Both the active (old) and incoming (new) ReplicaSets exist in the cluster concurrently.
- **3. Gradual handover**: New Pods are started and verified before old Pods are terminated.

~~~mermaid
flowchart TD
  Trigger["kubectl set image / edit / apply"] --> DeploymentController
  DeploymentController["Deployment controller\nobserves template change"] --> NewRS["New ReplicaSet\nbooking-v2 template\ntarget: 2"]
  DeploymentController --> OldRS["Old ReplicaSet\nbooking-v1 template\ntarget: decreasing"]
  NewRS -->|creates| NewPod1["booking-v2 Pod"]
  NewRS -->|creates| NewPod2["booking-v2 Pod"]
  OldRS -->|removes when ready pods allow| OldPod["booking-v1 Pod — deleted"]
~~~

*Diagram WL-03 — the Deployment manages two ReplicaSets during a rolling update; old Pods are replaced only as new Pods become ready.*

---

## Readiness gates the rollout

The rolling update progression is governed by two key parameters:

- **`maxSurge`** (default 25%): Maximum number of additional Pods created above the target replica count.
- **`maxUnavailable`** (default 25%): Maximum number of Pods that can be taken down during the update.
  - *Example*: With `replicas: 2` and `maxUnavailable: 25%`, Kubernetes rounds down to `0`. No old Pods are deleted until at least one new Pod is completely `Ready`.

### Why readiness probes protect deployments:
- A new container starting does **not** equal traffic-ready.
- The Service excludes unready Pods from the routing table until their readiness probe returns HTTP 200.
- If a broken release triggers `ImagePullBackOff` or crashes on boot, the rollout stalls immediately.
- The existing version remains active and continues serving passenger traffic without disruption.

---

## Rollback restores templates, not application side effects

When a regression occurs, `kubectl rollout undo` rolls back the Deployment:
- **What happens**: The Deployment controller designates the previous ReplicaSet as desired and scales it back up.
- **What does NOT happen**:
  - ❌ Database records written by the buggy version are **not** undone.
  - ❌ Confirmation emails or SMS messages dispatched to passengers are **not** retracted.
  - ❌ External payment gateway transactions are **not** refunded.
  - ❌ Consumed message queue items are **not** restored.

### The Expand-Contract migration pattern
To safely support rollbacks when database schemas change:
- **Phase 1 (Expand)**: Add new columns or tables in a backwards-compatible manner. Both v1 and v2 application binaries can run concurrently.
- **Phase 2 (Deploy)**: Roll out application v2. If issues arise, rolling back to v1 remains safe because v1 can still read the expanded schema.
- **Phase 3 (Contract)**: After v2 is stable, drop legacy columns and obsolete tables in a follow-up migration.

---

## Evidence and limits

Inspect rolling update health across each layer:

- **1. Rollout progress**: Check if the deployment is progressing or stalled:
  ```bash
  kubectl rollout status deployment/booking -n apollo-airlines
  ```
- **2. Pod distribution**: Confirm status breakdown between old and new replicas:
  ```bash
  kubectl get pods -n apollo-airlines -l app=booking
  ```
- **3. Active endpoints**: Verify the Service endpoint pool is populated:
  ```bash
  kubectl get endpoints booking -n apollo-airlines
  ```
- **4. Live synthetic check**: Validate live responses from outside the cluster:
  ```bash
  curl -i http://localhost:30082/readyz
  ```
- **5. Release revisions**: Inspect historical ReplicaSet revisions:
  ```bash
  kubectl rollout history deployment/booking -n apollo-airlines
  ```
