---
title: "Stage 10 — Optional Operations Missions"
description: "Planned independent mission catalog and its implementation boundary."
sidebar_label: "Stage 10: Missions (Planned)"
---

# Stage 10: Optional operations missions

:::warning[Status: not implemented]
- **Do not apply** `stages/stage10/`. Its README calls it unverified legacy scaffolding from a different application.
- Stage 10 will be a catalog of independent missions, not the next required deployment.
- Sources: `stages/stage10/README.md`, Stage 10 section of `ROADMAP.md`.
:::

**You will be able to:** distinguish a roadmap entry from a verified stage.

## Where we left off

- After Stages 1–9 the platform is built, observable, scaled, secured and in the cloud.
- What remains are **specialist operations skills**: canary releases, a service mesh, chaos testing, live debugging.
- Each of those is optional, and none depends on another. So Stage 10 is a catalog of missions, not one more required deployment.

## Planned catalog

| Mission | Teaches |
|---|---|
| Linkerd | Service mesh, mutual TLS |
| Argo Rollouts | Progressive delivery |
| Ephemeral-container debugging | Debug a running Pod |
| Kubeshark | Traffic inspection |
| Chaos Mesh | Controlled failure experiments |
| Advanced DR | Builds on Stage 9's Velero backups |

- No verified manifests, commands, traffic percentages, SLOs or recovery procedures exist yet.
- Lifecycle hooks already belong to Stage 4; the DevSecOps baseline belongs to Stage 8. Don't re-label them as Stage 10.

## What makes a mission runnable

- Declares prerequisites; starts from a trusted Apollo snapshot.
- Introduces **one** mechanism and makes it observable.
- Has a safe failure-and-recovery demonstration.
- Returns the cluster to baseline.

## Check the repo's status

```bash
sed -n '1,100p' stages/stage10/README.md
find stages/stage10 -maxdepth 2 -type f | sort
grep -n "not implemented" stages/stage10/README.md
grep -n "different application" stages/stage10/README.md
```

- The README says not to apply it, and both `grep`s match. The files are scaffolding from another app, not a mission.

## You should now be able to explain

- Explain why each optional mission needs its own prerequisites and cleanup.
- Say why finishing one must not require installing all.

Next: [Stage 11](./stage-11).
