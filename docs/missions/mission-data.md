---
title: "Stage 3 — Mission Data: Keep the Reservation"
sidebar_label: "Mission briefing"
---

# Stage 3 · Mission Data: storage

**Problem:** the database Pod is replaced. Which identity and bytes survive?

## Chapters

1. [Volume lifetimes](../learn/storage/volume-lifetimes)
2. [Claims and provisioning](../learn/storage/claims-and-provisioning)
3. [StatefulSets and headless DNS](../learn/storage/statefulsets-and-headless-dns)
4. [StatefulSet storage and operations](../learn/storage/statefulset-storage-and-operations)
5. [Initialization and seeding](../learn/storage/initialization-and-seeding)
6. [Recovery boundaries](../learn/storage/recovery-boundaries)

## Ready for the lab when you can answer

- Delete the Pod: do the PVC and PV remain? Delete the PVC: what happens?
- What does `identity-db-0` keep across replacement that a Deployment Pod would not?
- Why does a headless Service return Pod IPs instead of one virtual IP?
- Which failures does a PVC **not** protect against (node loss, cluster loss, bad `DELETE`)?

## Lab

- [Build Stage 3](../stage-3)
