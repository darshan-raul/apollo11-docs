---
title: "Cloud Appendix — EKS Research Boundary"
description: "Understand what the current EKS prototype contains, why it is not a supported lab, and how local Kubernetes concepts map to AWS."
sidebar_label: "Cloud Appendix: EKS Boundary"
---

# Cloud Appendix: EKS Research Boundary

:::danger[Do not run the EKS scripts as a learner lab]
The Apollo11 source repository classifies `stages/eks/` as **research input
only**. Its README and the project roadmap record unresolved Terraform,
routing, and teardown defects. Running it can create billable AWS resources,
and its cleanup path is not accepted as ownership-safe. This guide therefore
does not instruct you to execute `up.sh`, `apply-workloads.sh`, or `down.sh`.
:::

This boundary matters as much as any Kubernetes mechanism: an operational guide
must distinguish checked-in code from a verified lifecycle. Launchpad through
Stage 7 is the current runnable spine. Stage 9 will eventually rebuild the AWS
lab from the latest hardened Helm baseline; the current prototype trails that
baseline and ports Stage 3 workloads instead.

Sources:

- `stages/eks/README.md`
- `README.md` (the top-level current-stage status)
- `ROADMAP.md` (Stage 9 and the migration/trust policy)

## What the prototype contains

Read-only inspection of `stages/eks/` shows the intended cloud translation:

| Local learning mechanism | EKS prototype counterpart | Source path |
|---|---|---|
| kind control plane and workers | Amazon EKS and managed node groups | `stages/eks/terraform/cluster/eks.tf`, `node-groups.tf` |
| Local Docker images | Amazon ECR repositories | `stages/eks/terraform/ecr.tf` |
| kind Docker network | AWS VPC and subnets | `stages/eks/terraform/network/vpc.tf` |
| local-path volumes | EBS CSI-backed storage | `stages/eks/terraform/storage/storageclass.tf` |
| MetalLB address | AWS Network Load Balancer integration | `stages/eks/terraform/gateway/` |
| local identity | EKS Pod Identity and IAM policies | `stages/eks/terraform/cluster/pod-identity.tf`, `iam-policies.tf` |

This table says what files attempt to model; it does **not** certify that the
combined deployment is correct or safe to run.

## General Kubernetes context: what changes in a cloud

The Kubernetes resource relationships remain familiar: a Deployment still
creates ReplicaSets and Pods; a Service still selects ready Pods; a StatefulSet
still creates PVCs. The provider implementations beneath those abstractions
change:

- A `LoadBalancer` Service can ask an AWS controller to provision a real cloud
  load balancer instead of receiving an address from MetalLB.
- A PVC can be dynamically backed by EBS instead of kind node-local storage.
- Pods and controllers can use AWS workload identity rather than long-lived
  access keys.
- Nodes, load balancers, NAT gateways, EBS volumes, and registry storage can all
  incur cost and can outlive a failed command.

EBS volumes are zonal. A Pod using a bound EBS volume must run where that volume
can attach. `volumeBindingMode: WaitForFirstConsumer` lets scheduling influence
volume provisioning, but it does not create database replication or regional
resilience.

## A safe read-only investigation

### Objective

Trace how the prototype expresses cluster, storage, and edge concerns without
creating cloud resources.

### Starting point

Use a local clone of Apollo11. AWS credentials are neither needed nor wanted
for this investigation.

### Instructions

```bash
cd Apollo11

sed -n '1,220p' stages/eks/README.md
sed -n '1,220p' stages/eks/terraform/storage/storageclass.tf
sed -n '1,220p' stages/eks/terraform/cluster/pod-identity.tf
sed -n '1,220p' stages/eks/scripts/down.sh
```

### Expected result

You can identify which resources would be cluster-scoped, AWS-managed, stateful,
or billable, and you can explain why a cleanup script needs ownership-scoped
discovery rather than broad regional deletion.

### Verification

Confirm the trust boundary directly:

```bash
grep -n "research input only" stages/stage9/README.md
grep -n "do not promote prototype scripts" ROADMAP.md
```

### Troubleshooting

If either phrase is absent, stop: the application repository has changed since
this page was verified. Re-read its top-level `README.md`, `ROADMAP.md`,
`stages/eks/README.md`, and `stages/stage9/README.md` before relying on this
appendix.

### Concept reinforced

Infrastructure code is evidence of intent, not evidence of a successful,
reversible cloud lifecycle. Verification must cover provisioning, application
behavior, failure recovery, teardown, and residual-cost auditing.

## Before continuing

You should be able to answer:

1. Which Kubernetes abstractions stay the same between kind and EKS?
2. Which provider components implement networking, storage, and identity?
3. Why does Pod-replacement persistence not prove availability-zone recovery?
4. Why is the current `stages/eks/` tree reference-only despite having scripts?

Continue to [Stage 8: Security Enforcement Roadmap](./stage-8) for the next
planned curriculum boundary, or return to the runnable [Stage 7 lab](./stage-7).
