---
title: "Command Module — Decide Who Can Act"
sidebar_label: "Mission briefing"
---

# Command Module: security

**Status:** concepts only. No runnable Apollo stage exists yet (see [Stage 8](../stage-8)).

**Problem:** who may call the API, what may enter the cluster, who may reach a Pod, who may read a secret.

## Chapters

1. [Identity and authorization](../learn/security/identity-and-authorization): authn, RBAC.
2. [Admission and runtime](../learn/security/admission-and-runtime)
3. [Network policy](../learn/security/network-policy)
4. [Secrets and supply chain](../learn/security/secrets-and-supply-chain)

## Rules for this mission

- Each control guards a different boundary. None replaces another.
- Planned controls stay labelled *planned* until a stage demonstrates them.
