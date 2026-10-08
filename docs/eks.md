---
title: "Cloud Appendix — EKS Research Boundary"
description: "What the EKS prototype contains, why it is not a supported stage, and how local concepts map to AWS."
sidebar_label: "Cloud Appendix: EKS Boundary"
---

# Cloud appendix: EKS research boundary

:::danger[Do not run the EKS scripts as a learner stage]
- `stages/eks/` is classed **research input only**. Its README and the roadmap record unresolved Terraform, routing and teardown defects.
- It can create billable AWS resources; its cleanup is not accepted as ownership-safe. Do not run `up.sh`, `apply-workloads.sh` or `down.sh`.
- Sources: `stages/eks/README.md`, `README.md`, `ROADMAP.md`.
:::

**You will be able to:** map each local mechanism to its AWS counterpart, and explain why the code is evidence of intent, not of a safe lifecycle.

## Where we left off

- Every stage so far ran on kind, and every kind piece has a cloud counterpart. This page maps each one, so you know what changes when the same Helm chart runs on EKS.

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

## Read the prototype (no AWS credentials)

```bash
sed -n '1,120p' stages/eks/README.md
sed -n '1,120p' stages/eks/terraform/storage/storageclass.tf
sed -n '1,120p' stages/eks/terraform/cluster/pod-identity.tf
sed -n '1,120p' stages/eks/scripts/down.sh
```

| Resource | Scope | Stateful? | Billable? |
|---|---|---|---|
| EKS cluster | AWS-managed | No | Yes |
| EBS volume | One zone | Yes | Yes |
| NLB | AWS-managed | No | Yes |
| ECR repo | Regional | Images | Storage |
| IAM role | Account | No | No |

- **The rule a safe teardown must follow:** delete only what *your own* Terraform run created and tagged. Never sweep a region by tag or name.

## You should now be able to explain

- Map kind concepts to AWS ones.
- Explain why Pod-replacement persistence is not AZ recovery.
- Say why scripts in `stages/eks/` are reference-only.

Next: [Stage 8](./stage-8) or back to [Stage 7](./stage-7).
