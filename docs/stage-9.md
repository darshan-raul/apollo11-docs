---
title: "Stage 9: Lunar Orbit — AWS Cloud Lifecycle & Capstone"
description: "Deploy Apollo Airlines to Amazon EKS using modular Terraform: AWS NLB ingress, EBS CSI storage, cost forecasting, node drains, and Velero disaster recovery."
---

# Stage 9: Lunar Orbit — AWS Cloud Lifecycle & Capstone

**Goal:** Graduate from local development to a real, production-shaped cloud deployment on **Amazon Web Services (AWS) using Amazon EKS**. 

In Stages 1 through 8, Apollo Airlines ran entirely on local `kind` clusters using simulated LoadBalancers (MetalLB) and node-local storage (`local-path`). Stage 9 replaces every local mock with its real AWS cloud equivalent:
- `kind` cluster ──► **Managed Amazon EKS Control Plane**
- `kindnet` ──► **AWS VPC CNI** (Pods receive native AWS VPC IP addresses)
- MetalLB ──► **AWS Network Load Balancer (NLB)** provisioned by the AWS Load Balancer Controller
- `local-path` ──► **AWS EBS CSI Driver** provisioning dynamic `gp3` cloud disks with `WaitForFirstConsumer`
- Local Docker images ──► **Amazon Elastic Container Registry (ECR)**

---

## 1. Cloud Cost Model & Pre-Flight Budget Gate

Running cloud resources incurs real financial costs. Apollo11 is architected to minimize spend through **spot instances** and a single NAT gateway:

| AWS Resource | Monthly (Always-On) | Per 2-Hour Lab Session |
|---|---|---|
| EKS Managed Control Plane | $73.00 | $0.20 |
| 2 × `t3.small` Spot Worker Nodes | $18.25 | $0.05 |
| 1 × NAT Gateway | $32.85 | $0.09 |
| 1 × Elastic IP (EIP for NAT) | $3.65 | $0.01 |
| Internet-Facing Network Load Balancer (NLB) | $16.43 | $0.05 |
| 2 × Public IPv4 addresses for NLB | $7.20 | $0.02 |
| 2 × gp3 Node Root Volumes (20 GB) | $3.20 | $0.01 |
| 4 × 1 GB gp3 EBS StatefulSet Volumes | $0.32 | &lt;$0.01 |
| 6 × Amazon ECR Repositories | $0.00 (free tier) | $0.00 |
| **Total** | **~$156.00 / month** | **~$0.44 per 2-hour lab session** |

:::tip Spin Up, Learn, Tear Down
Because of the **one-command spin up (~10 min)** and **one-command tear down (~6 min)**, you can run this lab for less than **50 cents** per session! Never leave cloud resources running unattended overnight.
:::

---

## 2. Modular Terraform Architecture

Cloud infrastructure is codified cleanly under `stages/eks/terraform/`:

```text
stages/eks/terraform/
├── vpc/             # Multi-AZ VPC: public/private subnets, IGW, 1 NAT gateway
├── cluster/         # EKS cluster, KMS encryption, managed spot node group
├── storage/         # EBS CSI Driver IAM role + ebs-gp3 StorageClass
├── gateway/         # EnvoyProxy LBC annotations & HTTPRoutes
├── network/         # Security groups and ingress rules
├── ecr.tf           # 6 private ECR container repositories
└── variables.tf     # Region, node types, cluster naming
```

### The Critical `StorageClass` Discovery

A fresh Amazon EKS cluster ships with **zero default StorageClasses**! While the AWS EBS CSI driver addon is installed, the actual Kubernetes `StorageClass` object must be defined declaratively:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
parameters:
  type: gp3
  encrypted: "true"
```

**Why `volumeBindingMode: WaitForFirstConsumer` matters:** In a multi-AZ cluster (e.g. `us-east-1a` and `us-east-1b`), an EBS volume is bound to a single availability zone. If Kubernetes bound the volume immediately before scheduling the Pod, the scheduler might place the Pod in AZ-B while the volume was created in AZ-A! `WaitForFirstConsumer` delays volume creation until the scheduler chooses a specific node.

---

## 3. Production Cloud Ingress: Envoy Gateway + AWS NLB

The Envoy Gateway manifests from Stage 2/3 run unmodified, with only 5 AWS Load Balancer Controller (LBC) annotations added to `EnvoyProxy`:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: apollo-envoy-proxy
  namespace: apollo-airlines-apps
spec:
  provider:
    kubernetes:
      envoyService:
        type: LoadBalancer
        annotations:
          service.beta.kubernetes.io/aws-load-balancer-type: "external"
          service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: "instance"
          service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
          service.beta.kubernetes.io/aws-load-balancer-attributes: "load_balancing.cross_zone.enabled=true"
```

The AWS Load Balancer Controller reads these annotations and automatically materializes a real, multi-AZ AWS Network Load Balancer routing internet traffic to the Envoy proxy.

---

## 4. Hands-On Cloud Lifecycle Walkthrough

### Step 0: Prerequisites & AWS Authentication

Ensure your AWS CLI is authenticated with an account having Administrator or PowerUser permissions:

```bash
aws sts get-caller-identity
```

### Step 1: Spin Up the Infrastructure (~10 min)

From `stages/eks`:

```bash
cd stages/eks
./scripts/up.sh
```

The script runs Terraform across all modules:
1. Provisions the VPC across two Availability Zones.
2. Creates the EKS control plane and managed spot node groups.
3. Configures OIDC identity federation for IAM Roles for Service Accounts (IRSA).
4. Installs the AWS Load Balancer Controller and EBS CSI Driver addons.
5. Updates your local `~/.kube/config` with the EKS cluster context.

Verify the cloud nodes:
```bash
kubectl get nodes -o wide
# Expected: 2 EC2 spot instances running in us-east-1!
```

### Step 2: Deploy Workloads to AWS (~5 min)

```bash
./scripts/apply-workloads.sh
```

The deployment script:
1. Logs Docker into Amazon ECR.
2. Builds and pushes all 6 service container images to their respective ECR repos.
3. Deploys the 4 StatefulSets (EBS-backed).
4. Runs database bootstrap Jobs.
5. Deploys the Envoy Gateway and waits for AWS to provision the public NLB.

Retrieve the public AWS NLB DNS name:

```bash
NLB_HOSTNAME=$(kubectl get service -n apollo-airlines-apps \
  -l gateway.envoyproxy.io/owning-gateway-name=apollo-gateway \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')

echo "Public Cloud Gateway: http://${NLB_HOSTNAME}"
```

### Step 3: Run Cloud Verification

```bash
./scripts/verify.sh
```

The cloud verification suite executes ~40 automated checks:
- Verifies AWS VPC CNI assigns native VPC private IPs to Pods.
- Verifies EBS `gp3` volumes are formatted and bound.
- Validates NLB cross-zone health checks.
- Exercises end-to-end passenger flight reservations across the public internet.

---

## 5. Cloud Failure Labs: Node Drain & Disaster Recovery

### Experiment 1: Real Node Drain & PDB Protection

Drain one of the AWS EC2 worker nodes:

```bash
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
kubectl drain "$NODE" --ignore-daemonsets --delete-emptydir-data
```

**Observation:** Kubernetes respects our Stage 4 `PodDisruptionBudget` (`booking-pdb`), evicting one booking replica while the second replica continues handling live internet traffic through the AWS NLB without dropped requests.

Uncordon the node when finished:
```bash
kubectl uncordon "$NODE"
```

### Experiment 2: Disaster Recovery with Velero

Stage 9 includes a backup and restore exercise:
1. Take an application snapshot with Velero:
   ```bash
   velero backup create apollo-cloud-backup --include-namespaces apollo-airlines-apps
   ```
2. Destroy the `apollo-airlines-apps` namespace completely.
3. Restore from AWS S3:
   ```bash
   velero restore create --from-backup apollo-cloud-backup
   ```
4. Confirm that the EBS CSI driver dynamically re-provisions EBS disks from snapshots and restores database records!

---

## 6. Complete Cloud Teardown & Residue Audit

To guarantee that you are never billed for orphaned cloud resources:

```bash
# 1. Destroy all Kubernetes workloads and Terraform infrastructure (~6 min)
./scripts/down.sh

# 2. Execute the automated EBS and Load Balancer residue sweep
./scripts/ebs-sweep.sh
```

The `ebs-sweep.sh` script audits your AWS region to confirm that zero orphaned gp3 volumes, Network Load Balancers, Elastic IPs, or NAT Gateways were left behind.

---

## Production Gap Analysis: Learning vs Enterprise

Apollo11 delivers a **production-shaped** platform. In an authentic engineering evaluation, understanding what remains before true enterprise production is just as critical as knowing what is built:

| Capability | Apollo11 EKS Implementation | Enterprise Production Target |
|---|---|---|
| **Database Architecture** | Single-replica StatefulSets with EBS PVCs | High-Availability PostgreSQL (Patroni, Amazon Aurora multi-AZ, or CloudNativePG) |
| **Regional Disaster Recovery** | Single-region multi-AZ deployment | Multi-region active-passive failover with Route 53 latency routing |
| **Node Scaling** | Static 2-node spot group | Karpenter or Cluster Autoscaler with mixed instance types and Graviton ARM64 |
| **Secret Authority** | Terraform-injected Secrets & local Vault | AWS Secrets Manager / KMS integrated with External Secrets Operator |
| **Ingress Certificates** | HTTP / local certificates | Automated Let's Encrypt / ACM certificates via cert-manager |
| **Recovery SLA** | RTO: 30 min, RPO: 1 hour | RTO: &lt; 5 min, RPO: &lt; 1 min with synchronous streaming replication |

---

## Explain & Review Questions

1. **Why is the EBS `StorageClass` configured with `volumeBindingMode: WaitForFirstConsumer`?**
   In a multi-AZ cluster, an EBS volume is locked to a single AZ. This mode delays volume creation until the Kubernetes scheduler assigns the Pod to a specific node, ensuring the disk and the node are in the exact same Availability Zone.

2. **How does the AWS Load Balancer Controller create an NLB for the Envoy Proxy?**
   It watches for `Service` resources of type `LoadBalancer` (created by the EnvoyProxy resource). When it sees the AWS-specific annotations on the service, the controller makes API calls to AWS EC2 to provision a real Network Load Balancer and points its target groups at the Envoy Pods.

3. **Why is tearing down cloud infrastructure safely so critical?**
   Because orphaned resources (like NAT Gateways, detached EBS volumes, or unmapped Load Balancers) incur continuous hourly charges even if the Kubernetes cluster that created them is deleted.