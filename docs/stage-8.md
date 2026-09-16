---
title: Stage 8 — Command Module (planned)
description: Planned security rebuild for Apollo11.
---

# Stage 8 — Command Module

Stage 8 is an approved clean rebuild, not a completed learner lab. The current source tree is explicitly not trusted input for this phase. Do not treat old manifests or this page as an apply guide.

The target sequence is RBAC and Pod Security Admission, an enforcing Calico NetworkPolicy lab, Vault/External Secrets, and Kyverno plus Trivy/Cosign supply-chain controls. Each topic must eventually have a real Build → Inspect → Break → Recover → Explain exercise before it is marked complete.

## Concepts to prepare

Understand the difference between authentication and authorization, Role versus ClusterRole, service-account tokens, default-deny policy, secret retrieval/rotation, image provenance, admission, and the distinction between “policy exists” and “policy blocked the request.”

## Current status

Use Stages 1–7 for the supported path. Check the Apollo11 `ROADMAP.md` before relying on a future Stage 8 implementation.
