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

## Flight deck: the tools you'll use from here on

After the walkthrough, and before you tear Stage 1 down, learn the instruments. Same running airline, same checks, four ways:

1. [kubectl: zero to hero](../flight-deck/kubectl-zero-to-hero): how kubectl talks to the API, discovering types and fields, selectors, JSONPath, watching, logs, previewing changes.
2. [Contexts and a second cluster](../flight-deck/contexts-and-clusters): a small side kind cluster, kubeconfig contexts, and habits that stop a command landing on the wrong cluster.
3. [k9s](../flight-deck/k9s): every Ignition and Stage 1 check in a terminal UI.
4. [Headlamp](../flight-deck/headlamp): the same checks in a graphical UI, with a map of how the objects connect.
