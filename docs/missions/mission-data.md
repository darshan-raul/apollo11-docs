---
title: "Stage 3 — Mission Data: Keep the Reservation"
sidebar_label: "Mission briefing"
---

# Stage 3: Mission Data — Keep the Reservation

A replacement booking Pod is useful only if the passenger’s reservation still
exists where it needs to. Mission Data asks a more careful question than “is the
database persistent?”: which identity and bytes survive a container restart, a
Pod replacement, a claim release, node loss, or a cluster loss?

Storage is where broad assurances become expensive. A PersistentVolumeClaim,
a StatefulSet ordinal, an initialization Job, a backup, and a replica are
different mechanisms with different failure boundaries.

## What you will understand

1. [Volume lifetimes](../learn/storage/volume-lifetimes)
2. [Claims and provisioning](../learn/storage/claims-and-provisioning)
3. [StatefulSets and headless DNS](../learn/storage/statefulsets-and-headless-dns)
4. [StatefulSet storage and operations](../learn/storage/statefulset-storage-and-operations)
5. [Initialization and seeding](../learn/storage/initialization-and-seeding)
6. [Recovery boundaries](../learn/storage/recovery-boundaries)

The aim is not to declare that every database needs a StatefulSet. It is to
choose stable identity, ordered behaviour, and storage claims when the workload
actually needs them, then state what the chosen backend cannot recover.

## When to take the controls

Take the [Mission Data lab](../stage-3) when you can predict which resources
remain after deleting a database Pod and which would disappear if the claim were
deleted. The experiment should strengthen a precise claim, not a vague feeling
that the data is safe.

