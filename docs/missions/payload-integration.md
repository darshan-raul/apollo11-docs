---
title: "Stage 5 — Payload Integration: Change the Airline on Purpose"
sidebar_label: "Mission briefing"
---

# Stage 5 · Payload Integration: delivery

**Problem:** ship a change, compare it to the live cluster, and recover from a bad release.

## Chapters

1. [Rendering and Helm](../learn/delivery/rendering-and-helm)
2. [Kustomize comparison](../learn/delivery/kustomize-comparison)
3. [CI and image delivery](../learn/delivery/ci-and-image-delivery)
4. [GitOps and ownership](../learn/delivery/gitops-and-ownership)
5. [Promotion and rollback](../learn/delivery/promotion-and-rollback)

## Ready for the lab when you can answer

- Render vs apply vs sync vs healthy: what proves each?
- What does Helm store besides the YAML it applied?
- Who wins if you `kubectl scale` an Argo-managed Deployment?
- Rollback restores which things? Which writes stay?

## Lab

- [Build Stage 5](../stage-5)
