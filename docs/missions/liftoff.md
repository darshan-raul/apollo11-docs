---
title: "Stage 1 — Liftoff: Keep Apollo in the Air"
sidebar_label: "Mission briefing"
---

# Stage 1: Liftoff — Keep Apollo in the Air

The booking Pod has gone away. The passenger should not need to know whether the
airline created a replacement, but the operator needs to know exactly who did it
and what the replacement can safely inherit. Liftoff turns a running Pod into a
managed application: replicas, stable service names, configuration, finite
setup work, and a path for changing the version.

The stage begins with one important guardrail: labels that select Pods and owner
references that establish responsibility are different relationships.

## What you will understand

1. [Ownership and replicas](../learn/workloads/ownership-and-replicas)
2. [Services and readiness](../learn/workloads/services-and-readiness)
3. [Configuration and identity](../learn/workloads/configuration-and-identity)
4. [Jobs and initialization](../learn/workloads/jobs-and-initialization)
5. [Rollouts and rollback](../learn/workloads/rollouts-and-rollback)
6. [Ephemeral state](../learn/workloads/ephemeral-state)

By the end, you can explain why a replacement Pod can have a new identity and
address while callers still use a Service, why completed seed work belongs in a
Job, and why rollback cannot erase an already-written booking.

## When to take the controls

Open the [Liftoff lab](../stage-1) when you can predict the evidence for a
replacement Pod, a newly eligible endpoint, and a completed Job. The lab lets
you inspect the owner chain and safely watch those changes happen.


