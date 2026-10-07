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

## Exercise: where the catalog ends

**Goal:** confirm the six tracks and the legacy label.
**Time:** ~5 min

1. **Do:**

```bash
cd Apollo11
sed -n '1,100p' stages/stage11/README.md
find stages/stage11 -maxdepth 2 -type f | sort
grep -n "not implemented" stages/stage11/README.md
grep -n "legacy library-management" stages/stage11/README.md
```

2. **Check:** README marks it not implemented and lists the same six tracks.
3. **Your turn:** for the CRD track, list the three objects a working design needs (CRD, controller Deployment, RBAC for the controller) and what *evidence* would show the controller reconciles. Which of the three exist in the repo today?

<details>
<summary>Answer</summary>

None exist as Apollo files. Evidence: creating a custom resource changes real cluster state; deleting the controller stops that; status on the resource reports what the controller observed.
</details>

## You can now

- [ ] Separate "adds a kind" from "builds a working controller".
- [ ] Refuse to invent manifests for unimplemented stages.

Finish with the [Core Capstone](./capstone).
