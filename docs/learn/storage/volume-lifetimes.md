---
title: "Volume lifetimes"
description: "Name the failure boundary before calling storage persistent. Understand how emptyDir, hostPath, and PersistentVolumeClaims differ in what they survive, and what 'persistent' means in a local kind cluster."
---

# Volume lifetimes

*Stage 3 · Mission Data*

In Stage 1, Apollo's database Pods lost all stored records when replaced. While the Deployment controller successfully restarted healthy Pods, the PostgreSQL data directory resided on an `emptyDir` volume, guaranteeing permanent data loss.

Storage is never universally "persistent." You must always identify the exact failure boundary the volume is engineered to survive.

---

## Failure boundaries by storage type

~~~mermaid
flowchart TD
  subgraph ContainerBoundary["Container restart"]
    ContainerWL["Container writable layer"]
    ProcessMem["Process memory"]
    ContainerWL -->|survives ✅| ContainerRestart["Container restarts"]
    ProcessMem -->|lost ❌| ContainerRestart
  end
  subgraph PodBoundary["Pod deletion / replacement"]
    EmptyDir["emptyDir volume"]
    EmptyDir -->|lost ❌| PodReplaced["Pod replaced"]
    ContainerWL -->|lost ❌| PodReplaced
    PVC["PVC (local-path or cloud)"]
    PVC -->|survives ✅| PodReplaced
  end
  subgraph NodeBoundary["Node loss"]
    LocalPVC["PVC on local-path StorageClass"]
    CloudPVC["PVC on cloud block storage"]
    LocalPVC -->|lost ❌| NodeLost["Node removed"]
    CloudPVC -->|survives ✅ (usually)| NodeLost
  end
~~~

*Diagram ST-01 — each volume type has a named failure boundary it crosses and one it does not.*

| Volume mechanism | Survives container restart? | Survives Pod deletion? | Survives node loss? | Survives cluster loss? |
|---|---|---|---|---|
| **Process memory** | ❌ Lost | ❌ Lost | ❌ Lost | ❌ Lost |
| **Container writable layer** | ✅ Survives | ❌ Lost | ❌ Lost | ❌ Lost |
| **`emptyDir`** | ✅ Survives | ❌ Lost | ❌ Lost | ❌ Lost |
| **`hostPath`** | ✅ Survives | ✅ Survives (same node) | ❌ Lost | ❌ Lost |
| **PVC (`local-path`)** | ✅ Survives | ✅ Survives | ❌ Lost | ❌ Lost |
| **PVC (Cloud block / EBS)** | ✅ Survives | ✅ Survives | ✅ Survives (same AZ) | ❌ Lost |
| **Managed DB (RDS Multi-AZ)** | ✅ Survives | ✅ Survives | ✅ Survives | ✅ Survives |

---

## Intended use cases for `emptyDir`

`emptyDir` is allocated when the Pod is scheduled and destroyed immediately upon Pod deletion.

- **Appropriate use cases**:
  - Ephemeral scratch space for batch file processing.
  - In-memory tmpfs mounts (`emptyDir.medium: Memory`).
  - Shared working directories between init containers and application containers.
- **Inappropriate use cases**:
  - Database data directories (`/var/lib/postgresql/data`).
  - File upload caches that cannot be re-fetched.
  - Durable state required after rolling updates.

---

## The limits of local-path storage in kind

Stage 3 introduces PersistentVolumeClaims (PVCs) dynamically provisioned by `rancher.io/local-path`:
- **What it solves**: The PVC survives Pod replacement. New database replicas remount the existing PostgreSQL directory on the node.
- **What it does not solve**: Data is stored in `/var/local-path-provisioner/` on one specific Docker container node. If that worker node dies or is recreated, the data is permanently lost.

---

## Evidence and limits

- **1. Claim status**: Confirm PVC is bound:
  ```bash
  kubectl get pvc -n apollo-airlines-apps
  ```
- **2. StorageClass verification**: Check the underlying storage provider:
  ```bash
  kubectl get storageclass
  ```
- **3. Pod restart test**: Delete the database Pod and verify table persistence upon replacement:
  ```bash
  kubectl delete pod -l app=identity-db -n apollo-airlines-apps
  kubectl wait --for=condition=Ready pod -l app=identity-db -n apollo-airlines-apps --timeout=60s
  kubectl exec -n apollo-airlines-apps statefulset/identity-db -- psql -U postgres -d identity -c "\dt"
  ```
