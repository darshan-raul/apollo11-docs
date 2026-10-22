---
title: "Stage 3 — Mission Data: Keep the Reservation"
description: "Understand how Apollo keeps database files across Pod replacement, gives each database a stable identity, and separates persistence from recovery."
sidebar_label: "Mission briefing"
---

# Stage 3 · Mission Data

**You will be able to:** explain why a replacement database Pod can recover its files, trace those files through Kubernetes storage objects, and identify the failures that still require a backup.

## The problem carried from Stage 2

Stage 2 gives Apollo stable Service names and an HTTPS entry point. Those names keep working when a Pod changes, but they do not preserve its data. The three PostgreSQL databases and Redis still use `emptyDir`: replacing a database Pod removes its files. A replacement can answer at the same Service name while holding none of the previous bookings.

Stage 3 separates the lifetime of those files from the lifetime of a Pod. It also separates three responsibilities that are easy to confuse:

| Responsibility | Stage 3 mechanism | What it provides |
|---|---|---|
| Keep database files | PersistentVolumeClaim (PVC), a request for storage that outlives a Pod | A replacement can mount the existing volume |
| Reconnect a member to its files | StatefulSet, a controller with stable member names | `booking-db-0` returns using its own claim |
| Prepare a fresh database | PostgreSQL initialization scripts and separate seed Jobs | Tables and demo rows on a new volume |

These changes cover all four data workloads: `identity-db`, `flight-db`, `booking-db`, and `redis`. Application clients continue using the existing database Service names.

## Read in this order

| Chapter | Required prior knowledge | New concept | What the learner can explain afterwards |
|---|---|---|---|
| 1. [Volume lifetimes](../learn/storage/volume-lifetimes) | Pod lifecycle and `emptyDir` from Stage 1 | Storage lifetimes across process restart, container restart, and Pod replacement | Why a container restart preserves `emptyDir` while Pod replacement wipes it, and what kind's local storage survives |
| 2. [Claims and provisioning](../learn/storage/claims-and-provisioning) | Container volume mounts and Stage 2 Services | PVC, PV, StorageClass, dynamic provisioning, `WaitForFirstConsumer`, access modes | How a claim binds to a PV, why provisioning waits for scheduling, and why `ReadWriteOnce` means single-node access rather than database locking |
| 3. [StatefulSets and headless DNS](../learn/storage/statefulsets-and-headless-dns) | Deployments, ClusterIP Services, and CoreDNS from Stage 2 | StatefulSet ordinals, headless Services (`clusterIP: None`), per-member DNS | Why Deployments cannot manage dedicated per-member storage, how member DNS resolves, and why Apollo provides two Services per database |
| 4. [StatefulSet storage and operations](../learn/storage/statefulset-storage-and-operations) | StatefulSet member identity and PVC basics | `volumeClaimTemplates`, claim retention vs PV reclamation, Redis persistence | How ordinals reconnect to dedicated claims, the difference between retaining claims and deleting storage, and why Redis requires AOF config |
| 5. [Initialization and seeding](../learn/storage/initialization-and-seeding) | Kubernetes Jobs and ConfigMaps from Stage 1 | Database bootstrap vs seeding vs migrations, entrypoint hooks, idempotent SQL | Why init containers deadlock on database bootstrap, when entrypoint scripts run, and why neither script nor Job handles migrations |
| 6. [Recovery boundaries](../learn/storage/recovery-boundaries) | Claim lifecycle and database persistence | Persistence, availability, replication, backups, and recovery boundaries (RPO/RTO) | Which operations destroy data, why replication cannot substitute for backups, and what a restore rehearsal proves |

The chapters can be read without a cluster. Their optional inspection commands assume Stage 3 is already installed. Use the [Stage 3 walkthrough](../stage-3) to install the pinned snapshot and follow the running system.

## What this stage establishes

On kind, the volume is a directory inside one node container. It survives replacement of the database Pod while that directory and claim remain available. It does not provide another copy of the data, automatic database replication, or recovery after the node's storage is destroyed.

The walkthrough follows the objects down to that directory, then shows a record surviving Pod replacement. A `Bound` claim proves that storage was assigned; finding the same record afterwards proves that the database retained it.

## Ready for the walkthrough when you can explain

- Why `emptyDir` survives a container restart but disappears with its Pod.
- How a PVC, a PersistentVolume, and a StorageClass work together.
- Why `booking-db-0` can have a new Pod UID while using the same claim.
- Why a fresh database with tables and demo users is not evidence that bookings were recovered.
- Why deleting a Pod, deleting a claim, and destroying a kind node have different consequences.

**Continue:** [Volume lifetimes](../learn/storage/volume-lifetimes).
