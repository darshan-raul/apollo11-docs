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

**You will be able to:** distinguish a roadmap entry from a verified lab.

## Planned catalog

| Mission | Teaches |
|---|---|
| Linkerd | Service mesh, mutual TLS |
| Argo Rollouts | Progressive delivery |
| Ephemeral-container debugging | Debug a running Pod |
| Kubeshark | Traffic inspection |
| Chaos Mesh | Controlled failure experiments |
| Advanced DR | Builds on the Stage 9 Velero exercise |

- No verified manifests, commands, traffic percentages, SLOs or recovery procedures exist yet.
- Lifecycle hooks already belong to Stage 4; the DevSecOps baseline belongs to Stage 8. Don't re-label them as Stage 10.

## What makes a mission runnable

- Declares prerequisites; starts from a trusted Apollo snapshot.
- Introduces **one** mechanism and makes it observable.
- Has a safe break-and-recover exercise.
- Returns the cluster to baseline.

## Exercise: inspect, classify, stop

**Goal:** classify what is in `stages/stage10/` without running anything.
**Time:** ~5 min

1. **Predict:** the directory has files. Are they a lab?
2. **Do:**

```bash
cd Apollo11
sed -n '1,100p' stages/stage10/README.md
find stages/stage10 -maxdepth 2 -type f | sort
grep -n "not implemented" stages/stage10/README.md
grep -n "different application" stages/stage10/README.md
```

3. **Check:** README says do not apply; both `grep`s match.
4. **Your turn:** write the "runnable mission" checklist above for **Chaos Mesh**: its prerequisites, the one mechanism, the observable, the break-and-recover, and the clean-up. Mark every item you cannot fill from existing Apollo files as *missing*.

## You can now

- [ ] Explain why each optional mission needs its own prerequisites and cleanup.
- [ ] Say why finishing one must not require installing all.

Next: [Stage 11](./stage-11).
