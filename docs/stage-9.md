---
title: "Stage 9: Lunar Orbit — Cloud Provisioning"
description: "Deploy Kubernetes clusters on EKS, GKE, and AKS using Terraform, implement Cluster Autoscaler, and design for high availability."
---

# Stage 9: Lunar Orbit — Cloud Provisioning

**Goal:** Provision managed Kubernetes clusters on AWS (EKS), GCP (GKE), and Azure (AKS) using Terraform.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| **Cloud Kubernetes** | EKS, GKE, AKS | Managed k8s (control plane managed by cloud) |
| **Infrastructure as Code** | Terraform | Declarative cloud provisioning |
| **Cluster Autoscaling** | Cluster Autoscaler, Karpenter | Scale nodes based on demand |
| **High Availability** | Multi-AZ, PodDisruptionBudget | Survive node failures |
| **Load Testing** | k6 | Validate cluster performance |

---

## Why Managed Kubernetes?

| Aspect | Self-Managed | EKS/GKE/AKS |
|--------|--------------|-------------|
| Control plane | You manage | Cloud manages (HA) |
| etcd | You manage | Managed (multi-AZ) |
| API server | You upgrade | Automatic upgrades |

---

## Terraform for Kubernetes

### EKS Example

```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "apollo11-prod"
  cluster_version = "1.27"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    compute = {
      name           = "compute-node-group"
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 10
      desired_size   = 2
    }
  }
}
```

---

## Cluster Autoscaler

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-config
  namespace: kube-system
data:
  AWS_CLUSTER_NAME: apollo11-prod
```

---

## High Availability Design

### PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: auth-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: auth
```

---

## Key Takeaways

```
EKS/GKE/AKS:     Managed k8s (control plane handled by cloud)
Terraform:       IaC for provisioning cloud resources
Cluster Autoscaler: Scale nodes based on pod scheduling
Multi-AZ:        Distribute nodes across availability zones
PDB:             Protect critical pods during disruptions
k6:              Load testing to validate performance
```

---

## What's Next

Stage 10 introduces **Mission Extensions** — service mesh, progressive deployments, DevSecOps.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.