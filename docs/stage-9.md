---
title: "Stage 9 — AWS Cloud Lifecycle Roadmap"
description: "The planned AWS/EKS capstone, its untrusted legacy boundary, and the evidence a future cloud lab must produce."
sidebar_label: "Stage 9: Cloud (Planned)"
---

# Stage 9: Lunar Orbit — AWS Cloud Lifecycle

:::danger[Status: not implemented]
Do not apply the files currently in `stages/stage9/`. Its README describes the
`code/`, `k8s/`, and Terraform content as unverified legacy scaffolding. The
separate `stages/eks/` prototype is research material only, and it is not a safe
lifecycle for learners either.
:::

Sources: `stages/stage9/README.md`, `ROADMAP.md`, and `stages/eks/README.md`.

## Planned learner journey

The roadmap makes AWS/EKS the main provider and calls for a realistic lifecycle
that keeps cost in view:

1. Build the Terraform step by step for networking, EKS, nodes, the registry,
   storage, identity, and platform add-ons.
2. List every billable resource before applying anything.
3. Publish images to ECR and deploy the latest **hardened** Helm snapshot, not
   the older Stage 3 prototype workload.
4. Try AWS workload identity, dynamic storage, external access, DNS, and
   automatic TLS.
5. Watch Pod scaling and **Cluster Autoscaler** behavior.
6. Drain or replace a node and measure the effect of the topology and PDB rules.
7. Carry out a controlled Kubernetes upgrade, with behavior checks before and
   after.
8. Back up and restore the application with Velero.
9. Destroy only the resources you own, and show that no load balancer, disk,
   address, registry artifact, or node is still costing money.
10. Compare the EKS architecture and the portable manifests with GKE. Hands-on
    GKE work stays optional.

The goal is a setup that is "production-shaped". It is not a claim that the
result is ready for production. The roadmap requires a final gap analysis that
covers database high availability, regional resilience, recovery objectives,
capacity, security, and ownership.

## General background: what the future exercises must prove

In the cloud, the evidence you collect has two extra dimensions compared with the
local labs:

- **Provider state:** Kubernetes status is not enough. The AWS APIs and the
  Terraform state must agree about load balancers, volumes, identities, nodes,
  and tags.
- **Leftover cost:** a successful `terraform destroy` message does not prove that
  every billable dependent resource is gone.

In the same way, a PVC that survives Pod deletion proves only one narrow thing.
It does not prove multi-AZ database availability, that backups can be restored,
or that you have a defined recovery point objective.

## Safe exercise: audit the boundary

- **Objective**: Explain why neither the legacy Stage 9 nor the EKS prototype is
  a supported continuation of Stage 7.
- **Starting point**: A local Apollo11 clone. Do not configure AWS credentials.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage9/README.md
sed -n '157,195p' ROADMAP.md
sed -n '1,120p' stages/eks/README.md
```

- **Expected result**: You find the planned AWS lifecycle, the warning not to
  apply the legacy Stage 9 files, and the "research only" status of EKS.
- **Verification**:

```bash
grep -n "not implemented" stages/stage9/README.md
grep -n "research input only" stages/stage9/README.md
grep -n "production-shaped" ROADMAP.md
```

- **Troubleshooting**: If the wording in the repository has changed, trust the
  current Apollo11 files and re-check what is verified before you use any script.
- **Concept reinforced**: A cloud capstone is complete only when you have
  evidence for provisioning, behavior, failure, recovery, cleanup, and leftover
  cost.

## What you learned

- What Stage 9 is planned to cover.
- Why the current EKS files are not a supported lab, even though they are
  detailed.
- Why persistent storage and production readiness are different claims.
- Why checking the cleanup is part of getting the cloud setup right.

Continue to [Stage 10: Optional Operations Missions](./stage-10), or return to
the [EKS research boundary](./eks).
