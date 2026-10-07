---
title: "Stage 11 — Platform Engineering Specializations"
description: "The planned specialization catalog and its current implementation boundary."
sidebar_label: "Stage 11: Specializations (Planned)"
---

# Stage 11: Platform Engineering Specializations

:::warning[Status: not implemented]
Do not apply the files currently in `stages/stage11/`. Its README describes them
as unverified legacy scaffolding for a library-management app, which is not
compatible with the trusted Apollo Airlines stages.
:::

Source: `stages/stage11/README.md` and the Stage 11 section of `ROADMAP.md`.

## Planned independent tracks

- author an Apollo flight-status CRD and controller;
- scale from an observable event source with KEDA;
- operate Apollo Airlines on a k3s homelab;
- expose a paved developer workflow through Backstage;
- inspect and reduce cluster cost with Kubecost; and
- explore Cluster API with disposable management and workload clusters.

These are plans, not existing Apollo11 resources. Any YAML for a future custom
resource would only be an illustration until a real source file and a verified
controller exist. This page therefore does not make one up.

## General background

A **CustomResourceDefinition (CRD)** adds a new kind of object to the Kubernetes
API. A controller makes that object do something by repeatedly comparing the
desired state with the observed state and reconciling the two. Creating a CRD
alone does not add any behavior. Every specialization is held to the same standard
of evidence: status, events, logs or metrics, application behavior, recovery from
failure, and cleanup.

## Safe exercise: check where the catalog ends

- **Objective**: Identify the approved specializations without mistaking the
  legacy files for Apollo Airlines implementations.
- **Starting point**: A local Apollo11 clone. You do not need a cluster.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage11/README.md
sed -n '211,220p' ROADMAP.md
find stages/stage11 -maxdepth 2 -type f | sort
```

- **Expected result**: The README marks the stage as not implemented and lists
  the same six planned tracks as above.
- **Verification**:

```bash
grep -n "not implemented" stages/stage11/README.md
grep -n "legacy library-management" stages/stage11/README.md
```

- **Troubleshooting**: If the repository no longer matches, check its README,
  commands, manifests, and verification evidence again before you use the stage.
- **Concept reinforced**: Each specialization is an independent choice. None of
  them is proof that you have a production platform.

## What you learned

- The difference between adding a new kind to the Kubernetes API and building a
  controller that works.
- Why each advanced track needs its own prerequisites and cleanup.
- Why this guide does not invent Apollo11 manifests for stages that are not
  implemented.

To finish, do the [Stage 7 capstone](./capstone), which only uses the application
path that has been verified.
