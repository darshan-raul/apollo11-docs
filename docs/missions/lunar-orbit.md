---
title: "Lunar Orbit — Carry the Mission Beyond the Local Cluster"
sidebar_label: "Mission briefing"
---

# Lunar Orbit: cloud and recovery

**Status:** concepts only. The EKS prototype is unverified ([EKS boundary](../eks), [Stage 9](../stage-9)).

**Problem:** the same manifests apply on a cloud cluster, but ownership, failure domains and cost change.

## Chapters

1. [Local to cloud](../learn/cloud/local-to-cloud)
2. [Infrastructure and ownership](../learn/cloud/infrastructure-and-ownership)
3. [Topology, scaling and upgrades](../learn/cloud/topology-scaling-and-upgrades)
4. [Backup, restore and teardown](../learn/cloud/backup-restore-and-teardown)

## Rules for this mission

- A backup counts only after a restore is rehearsed and the app is verified.
- Teardown covers disks, addresses, identities, snapshots and billing leftovers, not just namespaces.
