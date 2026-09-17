---
title: "Stage 9 — AWS Cloud Lifecycle Roadmap"
description: "The planned AWS/EKS capstone, its untrusted legacy boundary, and the evidence a future cloud lab must produce."
sidebar_label: "Stage 9: Cloud (Planned)"
---

# Stage 9: Lunar Orbit — AWS Cloud Lifecycle

:::danger[Status: not implemented]
Do not apply the current files in `stages/stage9/`. Its source README identifies
the `code/`, `k8s/`, and Terraform content as unverified legacy scaffolding.
The separate `stages/eks/` prototype is research input only and also is not a
safe learner lifecycle.
:::

Sources: `stages/stage9/README.md`, `ROADMAP.md`, and `stages/eks/README.md`.

## Planned learner journey

The approved roadmap makes AWS/EKS the primary provider and requires a real,
cost-aware lifecycle:

1. Build Terraform incrementally for networking, EKS, nodes, registry,
   storage, identity, and platform add-ons.
2. Inventory every billable resource before applying anything.
3. Publish images to ECR and deploy the latest **hardened** Helm snapshot—not
   the older Stage 3 prototype workload.
4. Exercise AWS workload identity, dynamic storage, external access, DNS, and
   automated TLS.
5. Observe Pod scaling and **Cluster Autoscaler** behavior.
6. Drain or replace a node and measure the effects of topology and PDB rules.
7. Perform a controlled Kubernetes upgrade with pre/post behavior checks.
8. Back up and restore the application with Velero.
9. Destroy only owned resources and prove that no load balancer, disk, address,
   registry artifact, or node resource continues to incur unexpected cost.
10. Compare the EKS architecture and portable manifests with GKE; hands-on GKE
    remains optional.

This target is “production-shaped,” not a claim of production readiness. The
roadmap explicitly requires a final gap analysis for database high availability,
regional resilience, recovery objectives, capacity, security, and ownership.

## General context: what the future exercises must prove

Cloud infrastructure adds two evidence dimensions to the local learner loop:

- **Provider state**: Kubernetes status is not enough. AWS APIs and Terraform
  state must agree about load balancers, volumes, identities, nodes, and tags.
- **Cost residue**: a successful `terraform destroy` message is not sufficient
  proof that every billable dependent resource disappeared.

Similarly, a PVC surviving Pod deletion proves only one narrow behavior. It
does not prove multi-AZ database availability, backup recoverability, or a
defined recovery point objective.

## Safe exercise: audit the boundary

- **Objective**: Explain why neither legacy Stage 9 nor the EKS prototype is a
  supported continuation of Stage 7.
- **Starting point**: A local Apollo11 clone; do not configure AWS credentials.
- **Instructions**:

```bash
cd Apollo11
sed -n '1,220p' stages/stage9/README.md
sed -n '157,195p' ROADMAP.md
sed -n '1,120p' stages/eks/README.md
```

- **Expected result**: You find the planned AWS lifecycle, the warning against
  applying legacy Stage 9, and the research-only EKS status.
- **Verification**:

```bash
grep -n "not implemented" stages/stage9/README.md
grep -n "research input only" stages/stage9/README.md
grep -n "production-shaped" ROADMAP.md
```

- **Troubleshooting**: If the wording has changed, treat current Apollo11 files
  as authoritative and re-evaluate the trust boundary before using any script.
- **Concept reinforced**: A cloud capstone is complete only when provisioning,
  behavior, failure, recovery, cleanup, and residual-cost evidence all pass.

## What you learned

- The exact planned scope of Stage 9.
- Why the current EKS files are not a supported lab despite being detailed.
- Why storage persistence and production readiness are different claims.
- Why cleanup verification is part of cloud correctness.

Continue to [Stage 10: Optional Operations Missions](./stage-10), or return to
the [EKS research boundary](./eks).
