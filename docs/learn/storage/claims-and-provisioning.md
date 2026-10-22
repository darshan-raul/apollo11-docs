---
title: "Claims and provisioning"
description: "Follow a storage request through PVC, PV and StorageClass, then diagnose Pending claims and node placement."
---

# Claims and provisioning

*Stage 3 · Mission Data*

**You will be able to:** trace a claim to its volume, explain delayed provisioning, and read `ReadWriteOnce` without mistaking it for a database lock.

## The problem

[Volume lifetimes](./volume-lifetimes) established that database files need storage independent of the Pod. A manifest that directly names a node directory would make the application responsible for node placement and storage administration. The same manifest would also be unsuitable for a cluster using remote disks.

Kubernetes separates the application's storage request from the system that supplies it. This lets Apollo describe the capacity and access it needs while the cluster chooses how to provide them.

## Request storage, do not pick a disk

Three API objects connect the application's storage request to physical storage:

| Object | Meaning | Scope |
|---|---|---|
| **PersistentVolumeClaim (PVC)** | A user's or workload's request for storage (capacity, access mode, and class) | Namespace |
| **PersistentVolume (PV)** | A piece of provisioned cluster storage describing backend details and node accessibility | Cluster |
| **StorageClass** | A policy object defining which provisioner plugin handles requests and with which parameters | Cluster |

The actual bytes live in the underlying storage described by the PV (such as a node directory or cloud block volume). They are not inside the Kubernetes API objects. A Pod references a PVC in its namespace; when bound, that PVC points to a specific PV (`spec.volumeName`), and the PV points back to the claim (`spec.claimRef`).

A **provisioner** is a volume plugin or controller that creates storage in response to a claim. Allocating storage automatically when a PVC is created is called **dynamic provisioning**. In contrast, **static provisioning** requires an administrator to manually create PVs before workloads claim them.

## Dynamic provisioning

Dynamic provisioning involves a sequence of handoffs between the workload controller, the scheduler, the storage provisioner, and the node's kubelet:

1. **Claim declaration:** A workload or user declares a PVC requesting capacity (e.g. `1Gi`) and access modes.
2. **Scheduling evaluation:** If the StorageClass uses `volumeBindingMode: WaitForFirstConsumer`, the provisioner does not create a volume immediately. Instead, the Kubernetes scheduler evaluates the Pod that uses the claim. Once the scheduler chooses a node satisfying CPU, memory, and affinity rules, it annotates the PVC with `volume.kubernetes.io/selected-node`.
3. **Volume creation:** The provisioner reads the selected node annotation, creates the storage directory or volume on that specific node, and creates a matching cluster-scoped PV with `spec.nodeAffinity` matching the node.
4. **Binding:** The PV and PVC bind to each other in a mutually exclusive one-to-one relationship. The PVC transitions from `Pending` to `Bound`.
5. **Mounting:** The kubelet on the scheduled node attaches the volume, creates the filesystem mount at the container's `mountPath`, and starts the container.

### Why delayed provisioning matters

Under `volumeBindingMode: Immediate`, the provisioner creates a volume as soon as the PVC appears, choosing a node or zone arbitrarily. If the Pod later cannot schedule on that node (due to resource exhaustion, taints, or anti-affinity), the Pod becomes unschedulable. `WaitForFirstConsumer` prevents this by postponing volume creation until the scheduler has found a feasible node for the consuming Pod.

| Observation | Interpretation | Next inspection |
|---|---|---|
| Claim `Pending`, no consuming Pod | Normal behavior with `WaitForFirstConsumer` | Claim events and StorageClass binding mode |
| Claim and Pod both `Pending` | Scheduling or provisioning has not completed | `kubectl describe pod <name>` (Events), then claim events |
| `ProvisioningFailed` event | The storage provisioner failed to create storage | Provisioner controller logs and claim events |
| Missing class or no default | Claim has no provisioner to process the request | `kubectl get sc` |

### What access modes mean

An **access mode** describes how the storage can be mounted:

| Access mode | CLI short | Meaning |
|---|---|---|
| `ReadWriteOnce` | `RWO` | Can be mounted read-write by Pods on a **single node** |
| `ReadWriteOncePod` | `RWOP` | Can be mounted read-write by a **single Pod** (CSI driver dependent) |
| `ReadOnlyMany` | `ROX` | Can be mounted read-only by Pods on **many nodes** simultaneously |
| `ReadWriteMany` | `RWX` | Can be mounted read-write by Pods on **many nodes** simultaneously |

`ReadWriteOnce` is node-scoped, not Pod-scoped: multiple Pods on the same node could mount the same RWO volume. It does not provide database concurrency control or record locking.

## Apollo example

Apollo's [identity database manifest](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml) defines this claim template:

```yaml
# Under spec in identity-db-sts.yaml
volumeClaimTemplates:
  - metadata:
      name: pg-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
```

Key configuration details:
- **`requests.storage: 1Gi`**: Requests 1 gibibyte. On kind, the `local-path` provisioner allocates a directory on the node container rather than a partitioned block disk with hard quota enforcement. The `1Gi` value is used for scheduling checks; writes will continue past 1Gi if the node filesystem has room, and can fail if the node runs out of space.
- **`storageClassName` omitted**: Leaving `storageClassName` unset makes Kubernetes use the default StorageClass (`standard`, powered by `rancher.io/local-path`). Setting `storageClassName: ""` would explicitly request storage without a class, disabling dynamic provisioning.
- **Access mode `ReadWriteOnce`**: Appropriate for single-member databases where one PostgreSQL instance manages the directory.

## Try it

After installing Stage 3, trace the identity database claim to its PV and StorageClass:

```bash
kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o wide
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps \
  -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PV" -o yaml
kubectl get sc standard -o yaml
```

Expected:
- The PVC reports `STATUS` as `Bound` with `VOLUME` naming the generated PV and `ACCESS MODES` as `RWO`.
- The PV's `spec.claimRef.name` points back to `pg-data-identity-db-0`, and `spec.nodeAffinity` pins it to the worker node where the directory was created.
- The `standard` StorageClass displays `volumeBindingMode: WaitForFirstConsumer` and `reclaimPolicy: Delete`.

This proves that Kubernetes dynamically created dedicated node-local storage matched to `identity-db-0`'s scheduled location.

## Common misconceptions

- **“Bound means backed up.”** A `Bound` PVC means storage was allocated and attached. It provides no second copy or snapshot.
- **“A Pending claim indicates an error.”** Under `WaitForFirstConsumer`, a PVC remains `Pending` until a consuming Pod is created and evaluated by the scheduler.
- **“ReadWriteOnce means only one Pod can access the volume.”** RWO permits access from one *node*. Multiple Pods scheduled on that same node can mount the volume. Use `ReadWriteOncePod` if single-Pod exclusivity is required.

## Check yourself

<details>
<summary>Does omitting storageClassName make the claim use local-path on every Kubernetes cluster?</summary>

No. Omitting `storageClassName` requests the cluster's default StorageClass. On kind, the default is `standard` (`rancher.io/local-path`), but on EKS it might be `gp2` or `gp3` (AWS EBS), and on GKE it might be `standard-rwo` (Persistent Disk). Clusters without a default StorageClass will leave the PVC `Pending`.

</details>

<details>
<summary>Why does kind's default StorageClass use WaitForFirstConsumer instead of Immediate?</summary>

Because kind's storage is created as a local directory on a specific node. If it were provisioned immediately before scheduling, the volume might be placed on Node 1 while the database Pod was subsequently scheduled on Node 2, causing scheduling failure.

</details>

## Where this leads

[StatefulSets and headless DNS](./statefulsets-and-headless-dns) explains why standard Deployments cannot assign separate claims to individual database replicas, and how StatefulSets provide stable member identities.


## References

- [PersistentVolume claims and access modes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [StorageClass binding modes](https://kubernetes.io/docs/concepts/storage/storage-classes/#volume-binding-mode)
- [Local-path provisioner capacity limits](https://github.com/rancher/local-path-provisioner#cons)
