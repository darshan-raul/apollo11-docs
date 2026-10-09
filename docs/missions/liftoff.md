---
title: "Stage 1 — Liftoff: Keep Apollo in the Air"
sidebar_label: "Mission briefing"
---

# Stage 1 · Liftoff: workloads

**Problem:** a booking Pod disappears. Who replaces it, and what does the replacement inherit?

## Chapters

Builds on Ignition's [ReplicaSets](../learn/cluster/replicasets) and [Deployments](../learn/cluster/deployments).

1. [Services and readiness](../learn/workloads/services-and-readiness): stable name, ready endpoints only.
2. [Configuration and identity](../learn/workloads/configuration-and-identity): ConfigMap, Secret, ServiceAccount.
3. [Jobs and initialization](../learn/workloads/jobs-and-initialization): finite work.
4. [Rollouts and rollback](../learn/workloads/rollouts-and-rollback): change versions safely.
5. [Ephemeral state](../learn/workloads/ephemeral-state): what a Pod replacement loses.

## Ready for the walkthrough when you can answer

- Labels vs `ownerReferences`: which one makes a Pod "belong" to a ReplicaSet?
- Replacement Pod: new name? new IP? same Service address?
- Why is seed work a Job and not a Deployment?
- Rollback restores what? What can it not undo?

## Walkthrough

- [Stage 1 walkthrough](../stage-1)
