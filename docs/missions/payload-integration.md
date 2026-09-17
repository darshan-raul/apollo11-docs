---
title: "Stage 5 — Payload Integration: Change the Airline on Purpose"
sidebar_label: "Mission briefing"
---

# Stage 5: Payload Integration — Change the Airline on Purpose

Apollo Airlines will change: a new image, a configuration value, a different
replica count, or a fix to a booking flow. The question is no longer how to
write a YAML file once. It is how to produce the intended object graph, know who
owns it, compare it with the live cluster, and recover when a release is wrong.

Payload Integration follows a source change toward its artifact, rendered
objects, rollout, and observed runtime. Along the way, it separates Helm’s
rendered output from its release record, Kustomize transforms from runtime
reconciliation, and an Argo sync from health.

## What you will understand

1. [Rendering and Helm](../learn/delivery/rendering-and-helm)
2. [Kustomize comparison](../learn/delivery/kustomize-comparison)
3. [CI and image delivery](../learn/delivery/ci-and-image-delivery)
4. [GitOps and ownership](../learn/delivery/gitops-and-ownership)
5. [Promotion and rollback](../learn/delivery/promotion-and-rollback)

A version-looking tag is not automatically immutable. A rollback can restore
desired workload state, but it cannot reverse database writes or other side
effects that have already left the cluster.

## When to take the controls

Enter the [Payload Integration lab](../stage-5) when you can describe the
difference between render, apply, sync, health, and useful application
behaviour. That turns delivery commands into an auditable story.


