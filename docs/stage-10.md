---
title: "Stage 10 — Optional Operations Missions"
description: "Two verified standalone missions and the remaining planned operations catalog."
sidebar_label: "Stage 10: Optional Missions"
---

# Stage 10: Optional operations missions

:::info[Status: two runnable missions; remaining catalog planned]
CloudNativePG and Falco have recorded live verification and teardown evidence.
Only their dedicated `missions/` directories are trusted inputs. The legacy
Stage 10 `code/` and `k8s/` trees remain untrusted scaffolding.
:::

## Runnable standalone missions

| Mission | Prerequisites and observable outcome | Guide |
|---|---|---|
| CloudNativePG | Stage 3 persistence and Stage 4 disruption; two PostgreSQL instances, primary replacement, retained row and logical restore into a separate database | [Build, inspect, fail over, restore and teardown](./labs/cloudnativepg) |
| Falco | Linux kernel with modern eBPF; detect a harmless marker write, demonstrate a rule blind spot, restore detection and clean up | [Build, inspect, detect and teardown](./labs/falco) |

Run these separately on constrained hosts. CloudNativePG is a small evidence
database, not a migration of Apollo Booking; logical restore is not PITR or
proof of zero data loss. Falco detects a successful write and does not block it.
Its standalone success does not complete Stage 8.

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

- The remaining catalog entries above have no verified mission lifecycle yet.
- Lifecycle hooks already belong to Stage 4; the DevSecOps baseline belongs to Stage 8. Don't re-label them as Stage 10.

## What makes a mission runnable

- Declares prerequisites; starts from a trusted Apollo snapshot.
- Introduces **one** mechanism and makes it observable.
- Has a safe failure-and-recovery demonstration.
- Returns the cluster to baseline.

## Check the implementation boundary

Read `stages/stage10/README.md` and the individual mission README before
installing. October 22 evidence records CloudNativePG failover in 7 seconds,
retained data and a matching logical restore, plus Falco detection and cluster
teardown. Falco chart downloads timed out three times before the successful
attempt; an install error is not detection evidence.

Source: [recorded mission results](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/verification-runs/fix-2026-10-22/README.md#stage-10-missions).

## You should now be able to explain

- Explain why each optional mission needs its own prerequisites and cleanup.
- Say why finishing one must not require installing all.

Next: [Stage 11](./stage-11).
