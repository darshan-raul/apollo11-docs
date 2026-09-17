---
title: "Stage 10 — Optional Operations Missions"
description: "The planned, independent operations mission catalog and its current implementation boundary."
sidebar_label: "Stage 10: Missions (Planned)"
---

# Stage 10: Optional Operations Missions

:::warning[Status: not implemented]
Do not apply the current files in `stages/stage10/`. Its README identifies them
as unverified legacy scaffolding from a different application. Stage 10 will be
a catalog of independent missions, not the next required deployment snapshot.
:::

Source: `stages/stage10/README.md` and the Stage 10 section of `ROADMAP.md`.

## Planned catalog

- Linkerd service mesh and mutual TLS
- Argo Rollouts progressive delivery
- ephemeral-container debugging
- Kubeshark traffic inspection
- Chaos Mesh controlled-failure experiments
- advanced disaster recovery building on the required Stage 9 Velero exercise

These names describe intended topics only. Apollo11 does not yet contain
verified manifests, commands, traffic percentages, service-level objectives, or
recovery procedures for them.

Lifecycle hooks already belong to Stage 4, and the planned DevSecOps baseline
belongs to Stage 8. They must not be presented as new Stage 10 capabilities.

## How a future mission earns “runnable” status

Each mission must declare its prerequisites, start from a trusted Apollo
Airlines snapshot, introduce one mechanism, expose observable behavior, perform
a safe break/recover exercise, and cleanly return the cluster to baseline. A
tool being listed or installed is not proof that Apollo11 teaches it.

## Safe exercise: inspect, classify, stop

- **Objective**: Distinguish a mission catalog from an implemented lab.
- **Starting point**: A local Apollo11 clone; no cluster is required.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage10/README.md
sed -n '197,210p' ROADMAP.md
find stages/stage10 -maxdepth 2 -type f | sort
```

- **Expected result**: The README says not to apply the files, and the roadmap
  describes independent future missions.
- **Verification**:

```bash
grep -n "not implemented" stages/stage10/README.md
grep -n "different application" stages/stage10/README.md
```

- **Troubleshooting**: If either check fails because the repository evolved,
  read the new README and require lifecycle evidence before treating the stage
  as runnable.
- **Concept reinforced**: Installed artifacts and roadmap entries are not the
  same as verified application behavior.

## Before continuing

You should be able to explain why optional missions need independent
prerequisites and cleanup, and why completing one must not require installing
all of them.

Continue to [Stage 11: Platform Specializations](./stage-11).
