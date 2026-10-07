---
title: "Stage 8 — Security Enforcement Roadmap"
description: "The planned Apollo11 security stage, its trust boundary, and safe observations learners can make today."
sidebar_label: "Stage 8: Security (Planned)"
---

# Stage 8: Command Module — Security Enforcement

:::warning[Status: not implemented]
Apollo11 does not yet have a trusted `stages/stage8/` implementation. The
project roadmap says Stage 8 must be rebuilt from scratch on top of the verified
Stage 7 Helm baseline. Do not treat the examples on this page as Apollo11
manifests, and do not try to assemble a replacement stage from older branches.
:::

Where this status comes from: `README.md`, and the "Stage 8 — Command Module" and
"Implementation and trust policy" sections of `ROADMAP.md`.

## Why this stage exists

Earlier stages include individual security choices where they help teach a
concept. Stage 1, for example, creates dedicated ServiceAccounts with token
automount turned off, and Launchpad hardens its Compose application containers.
None of that shows that the Stage 7 Kubernetes chart is hardened. Stage 8 is
planned to make the security controls consistent, enforced, observable, and safe
to attack in a lab.

## Planned learning sequence

The roadmap defines four areas:

1. **Identity and workload baseline:** least-privilege RBAC, dedicated
   ServiceAccounts, token automount only where needed, non-root containers,
   seccomp, dropped capabilities, and read-only filesystems.
2. **Enforced networking:** replace kindnet with Calico, apply default-deny and
   least-privilege NetworkPolicies, and prove which traffic is allowed and which
   is denied.
3. **External secrets:** use Vault with the External Secrets Operator, and
   observe bootstrap, reconciliation, rotation, failure, and recovery.
4. **Admission and supply chain:** introduce Kyverno in audit and enforce modes,
   Trivy gates in CI, Cosign signing, and the rejection of unsigned images.

These are roadmap requirements. Apollo11 does not behave this way today.

## General Kubernetes background

- **RBAC** controls which API actions are allowed. A Role applies within one
  namespace. A RoleBinding gives a Role's permissions to a user, group, or
  ServiceAccount.
- **Pod Security Admission** checks Pods against a policy for their namespace.
  It is an admission control. It does not replace hardening the container image.
- **NetworkPolicy** declares which Pod traffic is allowed, but a compatible CNI
  has to enforce it. The kindnet CNI in the current learning cluster cannot show
  that enforcement, which Stage 8 needs.
- **External Secrets Operator** copies values from an external provider into
  Kubernetes Secrets. Ordinary Secret objects still exist in the running cluster.
- **Admission policy and image signing** can reject workloads before they are
  scheduled. This only works once the trust roots, identities, and the procedures
  for failure and recovery have been designed.

## Safe investigation: find the current gaps

### Objective

Tell apart the security controls that earlier stages verified from the ones that
are missing in the Stage 7 chart.

### Starting point

A local Apollo11 checkout. You do not need a running cluster.

### Instructions

```bash
cd Apollo11

# Stage 1 turns off token automount on its ServiceAccounts.
grep -n "automountServiceAccountToken" stages/stage1/k8s/config/serviceaccounts.yaml

# Read the later chart instead of assuming that setting was kept.
sed -n '1,180p' stages/stage7/helm/apollo11/templates/config/serviceaccount.yaml

# Search the application templates for the hardening fields the roadmap plans.
grep -R -n -E "runAsNonRoot|seccompProfile|readOnlyRootFilesystem|allowPrivilegeEscalation" \
  stages/stage7/helm/apollo11/templates/apps \
  stages/stage7/helm/apollo11/templates/ui || true
```

### Expected result

Both Stage 1 and the patched Stage 7 chart turn off token automount. The Stage 7
chart still does not set the hardening fields you searched for above. Protecting
the API token is not enough to reach the full Stage 8 security posture. This is a
known gap in the curriculum. It is not a reason to edit the application
repository while you follow this guide.

### Verification

```bash
cat stages/stage8/README.md
# Do not run a lab unless it is marked as implemented and has lifecycle evidence.
grep -n "Stage 8 is a clean rebuild" ROADMAP.md
```

### Troubleshooting

The `stages/stage8/` directory only holds a status placeholder. Its existence does
not mean a working security lab exists. Read its README and check the top-level
trust status before you run anything. A stage counts as implemented only when it
has its own snapshot and lifecycle evidence.

### Concept reinforced

Security posture belongs to a specific snapshot. A control shown in one stage
cannot be claimed for another stage unless its manifests and runtime evidence
show that it was carried over.

## What you learned

- The difference between a planned security design and security that is actually
  enforced at runtime.
- Why a NetworkPolicy needs a CNI that enforces it.
- Why having a ServiceAccount does not by itself mean least privilege.
- How to audit a later snapshot instead of assuming it inherited earlier security
  properties.

Continue to [Stage 9: Cloud Lifecycle Roadmap](./stage-9).
