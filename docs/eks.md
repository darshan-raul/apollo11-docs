---
title: Cloud Appendix — Amazon EKS prototype
description: Run the Apollo11 EKS prototype with Terraform, AWS networking, an NLB, and EBS CSI.
---

# Cloud Appendix — Amazon EKS prototype

The source repo's `stages/eks/` is a structurally reviewed prototype, not a trusted production capstone. It creates billable AWS resources. Use it after Stages 1–7, read the cost notes in the source README, and set a teardown reminder before applying.

## Lifecycle

```bash
cd Apollo11/stages/eks
devbox shell
aws sts get-caller-identity
bash scripts/up.sh
bash scripts/apply-workloads.sh
bash scripts/verify.sh
bash scripts/down.sh
```

Terraform provisions the VPC/subnets/NAT, EKS cluster and node group, IAM/OIDC/Pod Identity, ECR, KMS, add-ons, and EBS-backed storage. The workload layer carries the Envoy Gateway + MetalLB conceptual path into AWS, where the external listener is backed by an AWS NLB.

## YAML and cloud gotchas

- A Kubernetes `LoadBalancer` Service is an AWS controller request; the cloud controller and IAM permissions decide whether an NLB appears.
- EBS volumes are zonal. `WaitForFirstConsumer` helps provision in the Pod's AZ; an existing volume cannot freely attach in another AZ.
- Terraform state is the record of cloud ownership; do not delete resources manually and assume `terraform destroy` understands the drift.
- NAT gateways, EKS control planes, public IPv4 addresses, and idle load balancers cost money.
- The prototype is not multi-region, autoscaled, or a production security baseline.

Read `stages/eks/README.md` for the exact variables, cost assumptions, and troubleshooting before running anything.
