---
title: "Stage 1 — Liftoff: Keep Apollo in the Air"
sidebar_label: "Mission briefing"
---

# Stage 1 · Liftoff: workloads

**Problem:** a booking Pod disappears. Who replaces it, and what does the replacement inherit?

## Chapters

1. [Ownership and replicas](../learn/workloads/ownership-and-replicas): Deployment → ReplicaSet → Pod.
2. [Services and readiness](../learn/workloads/services-and-readiness): stable name, ready endpoints only.
3. [Configuration and identity](../learn/workloads/configuration-and-identity): ConfigMap, Secret, ServiceAccount.
4. [Jobs and initialization](../learn/workloads/jobs-and-initialization): finite work.
5. [Rollouts and rollback](../learn/workloads/rollouts-and-rollback): change versions safely.
6. [Ephemeral state](../learn/workloads/ephemeral-state): what a Pod replacement loses.

## Ready for the lab when you can answer

- Labels vs `ownerReferences`: which one makes a Pod "belong" to a ReplicaSet?
- Replacement Pod: new name? new IP? same Service address?
- Why is seed work a Job and not a Deployment?
- Rollback restores what? What can it not undo?

## Lab

- [Build Stage 1](../stage-1)
