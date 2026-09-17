---
title: "Lunar Orbit — Carry the Mission Beyond the Local Cluster"
sidebar_label: "Mission briefing"
---

# Lunar Orbit: Carry the Mission Beyond the Local Cluster

A local kind cluster lets us see Kubernetes mechanisms clearly. Moving Apollo to
a cloud changes the surrounding ownership, failure domains, storage behaviour,
network integrations, upgrade path, and cost of leftovers. The same manifest may
apply while the operational meaning changes.

Lunar Orbit maps the local lessons to those boundaries. It does not claim a
runnable cloud lifecycle where Apollo has not verified one.

## What you will understand

1. [Local to cloud](../learn/cloud/local-to-cloud)
2. [Infrastructure and ownership](../learn/cloud/infrastructure-and-ownership)
3. [Topology, scaling, and upgrades](../learn/cloud/topology-scaling-and-upgrades)
4. [Backup, restore, and teardown](../learn/cloud/backup-restore-and-teardown)

A cloud backup matters only after a restore is rehearsed and a recovered
application is verified. Teardown includes disks, addresses, identities,
snapshots, and billing residue—not only Kubernetes namespaces.

## Mission status

Read the [EKS research boundary](../eks) and
[Stage 9 cloud lifecycle roadmap](../stage-9) for the current Apollo status.


