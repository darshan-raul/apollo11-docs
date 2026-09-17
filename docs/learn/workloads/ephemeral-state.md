---
title: "Ephemeral state"
description: "Name the boundary before calling recovery complete. Understand what a controller can replace and what it cannot, then separate the storage lifetimes that matter for Apollo's databases."
---

# Ephemeral state

*Stage 1 · Liftoff*

A controller can replace a failed Pod, recreate a process, reassign an IP address, and restart a container. However, **it cannot recreate the specific bytes that existed only inside that Pod's process memory or container writable layer**. 

Before declaring a failure "self-healed," identify the precise storage boundary that retained the application's data.

---

## What a new Pod inherits vs. what is lost

When the booking ReplicaSet launches a replacement Pod after an unexpected failure:

- **What is preserved (inherited from the template)**:
  - **Identical container image**: same compiled binary, dependencies, and OS packages.
  - **Identical label set**: matching the Service selector for traffic routing.
  - **Identical template references**: reading the same ConfigMaps, Secrets, and ServiceAccount.
- **What is lost permanently**:
  - **Process memory**: in-flight HTTP requests, pending database transactions, and in-memory caches disappear.
  - **Container writable layer**: temporary scratch files, uncommitted logs, and local modifications vanish.
  - **Network identity**: the new Pod receives a fresh IP address (`10.244.2.9` instead of `10.244.1.5`).

~~~mermaid
flowchart LR
  OldPod["booking-xxxx\nMemory: in-flight reservations\nWritable layer: /tmp files\nPod IP: 10.244.1.5"] -->|deleted| Gone["State is gone"]
  Controller["ReplicaSet controller\nobserves replica shortfall"] -->|creates| NewPod["booking-yyyy\nMemory: empty\nWritable layer: empty\nPod IP: 10.244.2.9\nimage: same\nlabels: same"]
~~~

*Diagram WL-05 — the new Pod shares template and image; it does not share any runtime state from its predecessor.*

---

## The five storage boundaries

Do not classify storage as simply "ephemeral" or "persistent." Name the specific failure event the volume is expected to survive:

| Storage location | Survives container restart? | Survives Pod deletion? | Survives node loss? | Survives cluster loss? |
|---|---|---|---|---|
| **Process memory** | ❌ Lost | ❌ Lost | ❌ Lost | ❌ Lost |
| **Container writable layer** | ✅ Survives | ❌ Lost | ❌ Lost | ❌ Lost |
| **`emptyDir` volume** | ✅ Survives | ❌ Lost | ❌ Lost | ❌ Lost |
| **`hostPath` volume** | ✅ Survives | ✅ Survives (same node) | ❌ Lost | ❌ Lost |
| **PVC (`local-path`)** | ✅ Survives | ✅ Survives | ❌ Lost | ❌ Lost |
| **PVC (Cloud block / EBS)** | ✅ Survives | ✅ Survives | ✅ Survives (same AZ) | ❌ Lost |
| **Managed DB (RDS Multi-AZ)** | ✅ Survives | ✅ Survives | ✅ Survives | ✅ Survives (region scope) |

---

## Why calling it "ephemeral" is insufficient

In real-world operations, vague terminology hides real failure modes:

- **In-flight bookings**: An in-flight flight checkout whose confirmation email has not been written to an external queue disappears when the Pod crashes.
- **Database data directories**: If a PostgreSQL database mounts its data directory on `emptyDir`, a rolling update or node eviction completely erases the database, even though Kubernetes immediately spins up a healthy replacement.
- **Warm caches**: An application caching heavy search queries onto its local filesystem loses all cached data on every routine rollout, causing a latency spike on downstream databases.

Stage 3 (Mission Data) introduces PersistentVolumeClaims (PVCs) backed by storage providers to ensure state outlives Pod replacements.

---

## A critical question before deleting objects

Before running `kubectl delete` in staging or production, evaluate:
- *Which Kubernetes API objects will be removed?*
- *Which child objects will be cascaded via ownerReferences?*
- *Which state or data will be permanently unrecoverable once those objects are deleted?*

For example:
- Deleting a bare Pod removes its container writable layer and all associated `emptyDir` volumes.
- Deleting a Deployment removes its child ReplicaSets and Pods, but leaves referenced PersistentVolumeClaims intact because claims have an independent lifecycle.

---

## Evidence and limits

A replacement Pod in the `Running` state only indicates the process has launched:

- **1. Startup inputs**: Verify where the application pulled its initial state upon boot (database seed, Redis cache, or configuration keys).
- **2. Storage survival**: Confirm the volume directory still retains pre-existing files:
  ```bash
  kubectl exec -n apollo-airlines deploy/booking-db -- ls -la /var/lib/postgresql/data
  ```
- **3. Business verification**: Perform an end-to-end transaction to confirm application integrity:
  ```bash
  curl -s http://localhost:30082/api/bookings | jq .
  ```
