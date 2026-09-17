---
title: "Stage 11 — Platform Engineering Specializations"
description: "The planned specialization catalog and its current implementation boundary."
sidebar_label: "Stage 11: Specializations (Planned)"
---

# Stage 11: Platform Engineering Specializations

:::warning[Status: not implemented]
Do not apply the current files in `stages/stage11/`. Its README identifies them
as unverified legacy library-management scaffolding that is incompatible with
the trusted Apollo Airlines stages.
:::

Source: `stages/stage11/README.md` and the Stage 11 section of `ROADMAP.md`.

## Planned independent tracks

- author an Apollo flight-status CRD and controller;
- scale from an observable event source with KEDA;
- operate Apollo Airlines on a k3s homelab;
- expose a paved developer workflow through Backstage;
- inspect and reduce cluster cost with Kubecost; and
- explore Cluster API with disposable management and workload clusters.

These are intentions, not current Apollo11 resources. Any YAML illustrating a
future custom resource would be conceptual until a source path and verified
controller exist, so this page deliberately does not invent one.

## General context

A **CustomResourceDefinition (CRD)** extends the Kubernetes API with another
kind. A controller makes that object operational by repeatedly reconciling its
desired and observed state. Creating a CRD alone does not produce business
behavior. The same evidence standard applies to every specialization: status,
events, logs or metrics, application behavior, failure recovery, and cleanup.

## Safe exercise: verify the catalog boundary

- **Objective**: Identify the approved specializations without mistaking legacy
  files for Apollo Airlines implementations.
- **Starting point**: A local Apollo11 clone; no cluster is required.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage11/README.md
sed -n '211,220p' ROADMAP.md
find stages/stage11 -maxdepth 2 -type f | sort
```

- **Expected result**: The source README marks the stage unimplemented and
  names the same six intended tracks listed above.
- **Verification**:

```bash
grep -n "not implemented" stages/stage11/README.md
grep -n "legacy library-management" stages/stage11/README.md
```

- **Troubleshooting**: If current source no longer matches, re-audit its README,
  commands, manifests, and verification evidence before using the stage.
- **Concept reinforced**: Specializations are independent learning choices, not
  implied proof of a production platform.

## What you learned

- The difference between extending the Kubernetes API and implementing a
  working controller.
- Why each advanced track needs its own prerequisites and cleanup.
- Why this guide avoids invented Apollo11 manifests for unimplemented stages.

Finish with the runnable [Stage 7 capstone](./capstone), which uses only the
currently verified application path.
