---
title: "Cloud Appendix — EKS Research Boundary"
description: "What the EKS prototype contains, why it is not a lab, and how local concepts map to AWS."
sidebar_label: "Cloud Appendix: EKS Boundary"
---

# Cloud appendix: EKS research boundary

:::danger[Do not run the EKS scripts as a learner lab]
- `stages/eks/` is classed **research input only**. Its README and the roadmap record unresolved Terraform, routing and teardown defects.
- It can create billable AWS resources; its cleanup is not accepted as ownership-safe. Do not run `up.sh`, `apply-workloads.sh` or `down.sh`.
- Sources: `stages/eks/README.md`, `README.md`, `ROADMAP.md`.
:::

**You will be able to:** map each local mechanism to its AWS counterpart, and explain why the code is evidence of intent, not of a safe lifecycle.

## Local → EKS prototype

| Local | EKS counterpart | File |
|---|---|---|
| kind control plane + workers | EKS + managed node groups | `terraform/cluster/eks.tf`, `node-groups.tf` |
| Local images | ECR repositories | `terraform/ecr.tf` |
| kind Docker network | VPC + subnets | `terraform/network/vpc.tf` |
| `local-path` volumes | EBS CSI storage | `terraform/storage/storageclass.tf` |
| MetalLB address | AWS Network Load Balancer | `terraform/gateway/` |
| Local kubeconfig identity | EKS Pod Identity + IAM | `terraform/cluster/pod-identity.tf`, `iam-policies.tf` |

- The table says what the files **attempt**. It does not certify the combination is correct or safe.
- The prototype ports Stage 3 workloads, not the latest hardened Helm baseline.

## What changes in the cloud

| Unchanged | Changes |
|---|---|
| Deployment → ReplicaSet → Pods; Service selects ready Pods; StatefulSet → PVCs | `LoadBalancer` → real cloud LB (cost); PVC → EBS (zonal); Pods use AWS workload identity instead of long-lived keys; nodes/NAT/EBS/ECR cost money and can outlive a failed command |

- EBS volumes are **zonal**: the Pod must run where the volume can attach. `WaitForFirstConsumer` aligns first placement; it is not replication.

## Exercise: read-only trace (no AWS credentials)

**Goal:** classify each resource as cluster-scoped, AWS-managed, stateful or billable, and explain why cleanup needs ownership-scoped discovery.
**Time:** ~10 min

1. **Predict:** which resources in a `down.sh` would be dangerous to delete by tag or region alone?
2. **Do:**

```bash
cd Apollo11
sed -n '1,120p' stages/eks/README.md
sed -n '1,120p' stages/eks/terraform/storage/storageclass.tf
sed -n '1,120p' stages/eks/terraform/cluster/pod-identity.tf
sed -n '1,120p' stages/eks/scripts/down.sh
grep -n "research input only" stages/stage9/README.md
grep -n "do not promote prototype scripts" ROADMAP.md
```

3. **Check:** both `grep`s match. If not, the repo changed since this page was written: re-read the READMEs before relying on it.
4. **Fill in:**

| Resource | Scope | Stateful? | Billable? |
|---|---|---|---|
| EKS cluster | AWS-managed | No | Yes |
| EBS volume | Zonal | Yes | Yes |
| NLB | AWS-managed | No | Yes |
| ECR repo | Regional | Images | Storage |
| IAM role | Account | No | No |

5. **Your turn:** write the rule a safe teardown script must follow when choosing what to delete (hint: tags set by *your* Terraform run, not a broad regional sweep).

## You can now

- [ ] Map kind concepts to AWS ones.
- [ ] Explain why Pod-replacement persistence is not AZ recovery.
- [ ] Say why scripts in `stages/eks/` are reference-only.

Next: [Stage 8](./stage-8) or back to [Stage 7](./stage-7).
