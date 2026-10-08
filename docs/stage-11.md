---
title: "Stage 11 — Platform Engineering Specializations"
description: "Planned specialization catalog and its implementation boundary."
sidebar_label: "Stage 11: Specializations (Planned)"
---

# Stage 11: Platform engineering specializations

:::warning[Status: not implemented]
- **Do not apply** `stages/stage11/`. Its README calls it unverified legacy scaffolding for a library-management app, incompatible with Apollo Airlines.
- Sources: `stages/stage11/README.md`, Stage 11 section of `ROADMAP.md`.
:::

**You will be able to:** explain what a CRD is and is not, and tell planned tracks from existing resources.

## Where we left off

- By Stage 10 you operate a platform. Stage 11 is about **building platforms for others**:
  - your own Kubernetes API types (CRDs and controllers),
  - event-driven scaling,
  - developer portals,
  - cost visibility,
  - clusters that create clusters.
- Each track extends a different earlier stage: a CRD + controller is the reconciliation loop from Ignition, written by you. KEDA extends Stage 7's HPA. Kubecost builds on Stage 4's requests.

## Planned independent tracks

| Track | Idea |
|---|---|
| CRD + controller | Apollo flight-status resource |
| KEDA | Scale from an event source |
| k3s | Run Apollo on a homelab |
| Backstage | Paved developer workflow |
| Kubecost | Inspect and reduce cost |
| Cluster API | Disposable management + workload clusters |

- These are plans. Any YAML for a future custom resource is illustration only: no real source file or verified controller exists.

## CRD in two lines

- A **CustomResourceDefinition** adds a new object kind to the API.
- A **controller** makes it do something by reconciling desired vs observed state. A CRD alone adds no behaviour.
- Every track is held to the same evidence standard: status, events, logs/metrics, application behaviour, failure recovery, clean-up.

## Check the repo's status

```bash
sed -n '1,100p' stages/stage11/README.md
find stages/stage11 -maxdepth 2 -type f | sort
grep -n "not implemented" stages/stage11/README.md
grep -n "legacy library-management" stages/stage11/README.md
```

- The README marks it not implemented. None of the three pieces a CRD track needs exists as Apollo files: the CRD, the controller Deployment, and the controller's RBAC.

## You should now be able to explain

- Separate "adds a kind" from "builds a working controller".
- Refuse to invent manifests for unimplemented stages.

Finish with the [Core Capstone](./capstone).
