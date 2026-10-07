---
title: "Stage 9 — AWS Cloud Lifecycle Roadmap"
description: "Planned AWS/EKS capstone, the untrusted legacy boundary, and what a cloud lab must prove."
sidebar_label: "Stage 9: Cloud (Planned)"
---

# Stage 9: Lunar Orbit (AWS lifecycle)

:::danger[Status: not implemented]
- **Do not apply** anything in `stages/stage9/`. Its README calls the `code/`, `k8s/` and Terraform content unverified legacy scaffolding.
- `stages/eks/` is research material only, not a safe learner lifecycle.
- Sources: `stages/stage9/README.md`, `ROADMAP.md`, `stages/eks/README.md`.
:::

**You will be able to:** list what a trustworthy cloud lab must demonstrate, and verify the repo's own status.

## Planned journey (AWS/EKS primary)

| # | Step | Evidence required |
|---|---|---|
| 1 | Terraform step by step: network, EKS, nodes, registry, storage, identity, add-ons | `plan` reviewed |
| 2 | **List every billable resource before applying** | Cost inventory |
| 3 | ECR images; deploy the latest **hardened** Helm snapshot | Not the old Stage 3 prototype |
| 4 | AWS workload identity, dynamic storage, external access, DNS, TLS | Passenger request over HTTPS |
| 5 | Pod scaling + **Cluster Autoscaler** | Pending Pods → new node |
| 6 | Drain/replace a node; measure topology + PDB effect | Request sampler during drain |
| 7 | Controlled Kubernetes upgrade | Behaviour checks before and after |
| 8 | Backup/restore with **Velero** | Restored app verified |
| 9 | Destroy only what you own | No LB, disk, address, registry artifact or node still billing |
| 10 | Compare with GKE (optional hands-on) | Portability analysis |

- Goal is **production-shaped**, not production-ready; a final gap analysis covers database HA, regional resilience, RPO/RTO, capacity, security and ownership.

## Two extra evidence dimensions

| Dimension | Why Kubernetes status is not enough |
|---|---|
| Provider state | AWS APIs and Terraform state must agree about LBs, volumes, identities, nodes, tags |
| Leftover cost | `terraform destroy` success ≠ every billable dependent is gone |

- A PVC surviving Pod deletion proves one narrow thing, not multi-AZ availability, restorable backups or an RPO.

## Exercise: audit the boundary (no AWS credentials)

**Goal:** show why neither Stage 9 nor `stages/eks/` is a supported continuation.
**Time:** ~5 min

1. **Predict:** which two phrases will the repo use to mark these directories?
2. **Do:**

```bash
cd Apollo11
sed -n '1,120p' stages/stage9/README.md
grep -n "not implemented" stages/stage9/README.md
grep -n "research input only" stages/stage9/README.md
grep -n "production-shaped" ROADMAP.md
sed -n '1,80p' stages/eks/README.md
```

3. **Check:** each `grep` returns a line. If one is empty, the repo changed: re-read the READMEs before trusting any script.
4. **Your turn:** from the roadmap list above, pick the three steps most likely to leave billable leftovers and name the resource each would leave (load balancer, EBS volume, NAT gateway, ECR image, snapshot).

<details>
<summary>Answer</summary>

Step 4 (provider load balancer, Elastic IP), step 5/6 (extra nodes/EBS volumes left after scale-up), step 8 (Velero snapshots/S3 objects). Also NAT gateways and ECR images from steps 1 and 3.
</details>

## You can now

- [ ] Explain why the current EKS files are not a supported lab.
- [ ] Say why persistence ≠ availability-zone recovery.
- [ ] Treat cleanup verification as part of the lab.

Next: [Stage 10](./stage-10) or the [EKS boundary](./eks).
