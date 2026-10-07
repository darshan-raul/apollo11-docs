---
title: "Stage 10 — Optional Operations Missions"
description: "The planned, independent operations mission catalog and its current implementation boundary."
sidebar_label: "Stage 10: Missions (Planned)"
---

# Stage 10: Optional Operations Missions

:::warning[Status: not implemented]
Do not apply the files currently in `stages/stage10/`. Its README describes them
as unverified legacy scaffolding from a different application. Stage 10 will be a
catalog of independent missions. It will not be the next required deployment
snapshot.
:::

Source: `stages/stage10/README.md` and the Stage 10 section of `ROADMAP.md`.

## Planned catalog

- Linkerd service mesh and mutual TLS
- Argo Rollouts progressive delivery
- ephemeral-container debugging
- Kubeshark traffic inspection
- Chaos Mesh controlled-failure experiments
- advanced disaster recovery building on the required Stage 9 Velero exercise

These are only the topics Apollo11 intends to cover. It does not yet have
verified manifests, commands, traffic percentages, service-level objectives, or
recovery procedures for any of them.

Lifecycle hooks already belong to Stage 4, and the planned DevSecOps baseline
belongs to Stage 8. Do not present either of them as a new Stage 10 capability.

## How a future mission becomes runnable

A mission must:
- declare its prerequisites;
- start from a trusted Apollo Airlines snapshot;
- introduce one mechanism;
- make the behavior observable;
- include a safe break-and-recover exercise; and
- return the cluster cleanly to its baseline.

A tool that is listed or installed does not mean Apollo11 teaches it.

## Safe exercise: inspect, classify, stop

- **Objective**: Tell a mission catalog apart from a lab that is actually implemented.
- **Starting point**: A local Apollo11 clone. You do not need a cluster.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage10/README.md
sed -n '197,210p' ROADMAP.md
find stages/stage10 -maxdepth 2 -type f | sort
```

- **Expected result**: The README tells you not to apply the files, and the
  roadmap describes independent missions for the future.
- **Verification**:

```bash
grep -n "not implemented" stages/stage10/README.md
grep -n "different application" stages/stage10/README.md
```

- **Troubleshooting**: If a check fails because the repository has changed, read
  the new README. Do not treat the stage as runnable until it has lifecycle
  evidence.
- **Concept reinforced**: Installed files and roadmap entries are not the same as
  application behavior that has been verified.

## Before continuing

You should be able to explain why each optional mission needs its own
prerequisites and cleanup, and why finishing one must not require installing all
of them.

Continue to [Stage 11: Platform Specializations](./stage-11).
