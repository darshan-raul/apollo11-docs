---
title: "Claims and provisioning"
description: "Understand how a PersistentVolumeClaim becomes a bound PersistentVolume through a StorageClass, what WaitForFirstConsumer binding means, and what access modes actually control."
---

# Claims and provisioning

*Stage 3 · Mission Data*

Apollo's databases declare storage requirements through abstract claims rather than naming raw disks. By decoupling storage requests from physical infrastructure, the same manifest runs on local test nodes or cloud storage pools without modification.

---

## The three storage primitives

Storage management relies on three distinct API objects:

- **1. PersistentVolumeClaim (PVC)**:
  - Namespaced user request for storage (capacity, access mode, StorageClass).
  - Owned and managed by developers and workloads.
- **2. PersistentVolume (PV)**:
  - Cluster-scoped representation of physical storage (a local directory, AWS EBS volume, or NFS share).
  - Bound 1-to-1 with a matching PVC.
- **3. StorageClass**:
  - Cluster-scoped configuration defining the provisioner plugin (e.g. `rancher.io/local-path`) and allocation policies.

~~~mermaid
flowchart LR
  STS["StatefulSet: identity-db\nvolumeClaimTemplates:\n  name: pg-data\n  1Gi, ReadWriteOnce"] -->|creates| PVC["PVC: pg-data-identity-db-0\nStatus: Bound"]
  PVC -->|requests from| SC["StorageClass: standard\nprovisioner: rancher.io/local-path"]
  SC -->|instructs| Provisioner["local-path-provisioner\n(runs as a Pod)"]
  Provisioner -->|creates| PV["PV: pvc-xxxxx\n/var/local-path-provisioner/...\nCapacity: 1Gi"]
  PVC <-->|bound to| PV
  PV --> Disk["Node filesystem\n(apollo11-worker)"]
~~~

*Diagram ST-02 — the StatefulSet creates the PVC; the StorageClass provisioner creates the PV; PVC and PV are bound together.*

---

## Local workstation storage vs. cloud persistent storage

Where do the physical bytes actually get stored? The answer depends entirely on your cluster environment:

| Storage Type | Local `kind` Cluster | Cloud Production (AWS EKS, GCP GKE) |
|---|---|---|
| **Provisioner Plugin** | `rancher.io/local-path` | CSI Driver (e.g. `ebs.csi.aws.com`, `pd.csi.storage.gke.io`) |
| **Storage Medium** | A directory on the node's local filesystem (`/var/local-path-provisioner/...`) | Network-attached block storage (AWS EBS Volume, Google Persistent Disk) |
| **Survives Pod Deletion?** | ✅ Yes. A replacement Pod scheduled on that node remounts the directory. | ✅ Yes. |
| **Survives Worker Node Loss?** | ❌ **No.** The data lives physically inside that single worker node container. If the node is destroyed, the volume is lost. | ✅ **Yes.** The cloud storage volume exists independently on the cloud network. If Node A dies, the volume detaches from Node A and attaches to Node B! |

In Apollo11's local kind cluster, `standard` StorageClass provisions directories on the worker node. This is ideal for learning because it behaves like real dynamic storage without costing cloud money. But remember its failure boundary: **it is node-local, not high-availability cloud storage.**

---

## `WaitForFirstConsumer`: aligning storage with compute topology

When storage is physically tied to specific nodes (as with local disks):
- **Immediate binding problem**: If a PVC binds to Node A before the Pod is scheduled, the scheduler might subsequently place the Pod on Node B due to CPU availability, rendering the volume inaccessible.
- **Solution (`WaitForFirstConsumer`)**: Delays volume provisioning until the Kubernetes scheduler has officially chosen a node for the consuming Pod.

~~~yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: rancher.io/local-path
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
~~~

---

## Access modes: node constraints vs. Pod counts

Access modes represent node-level mounting semantics:

- **`ReadWriteOnce` (RWO)**:
  - Can be mounted read-write by a **single node** at a time.
  - *Caveat*: Multiple Pods residing on that *same* node can still mount it simultaneously.
- **`ReadOnlyMany` (ROX)**:
  - Can be mounted read-only by multiple nodes concurrently.
- **`ReadWriteMany` (RWX)**:
  - Can be mounted read-write by multiple nodes concurrently (requires network filesystems like NFS, Ceph, or AWS EFS).

---

## Evidence and limits

- **1. Claim status and binding**: Check if PVC is `Bound` or `Pending`:
  ```bash
  kubectl get pvc -n apollo-airlines-apps
  ```
- **2. Binding events**: If stuck in `Pending`, inspect scheduler events:
  ```bash
  kubectl describe pvc pg-data-identity-db-0 -n apollo-airlines-apps | grep -A 5 Events:
  ```
- **3. Storage provider logs**: Ensure dynamic provisioner is functioning:
  ```bash
  kubectl logs -n local-path-storage -l app=local-path-provisioner
  ```
