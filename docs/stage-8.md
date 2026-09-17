---
title: "Stage 8 — Security Enforcement Roadmap"
description: "The planned Apollo11 security stage, its trust boundary, and safe observations learners can make today."
sidebar_label: "Stage 8: Security (Planned)"
---

# Stage 8: Command Module — Security Enforcement

:::warning[Status: not implemented]
There is currently no trusted `stages/stage8/` implementation in Apollo11.
The project roadmap explicitly requires a clean rebuild from the verified Stage
7 Helm baseline. Do not treat examples on this page as Apollo11 manifests or
attempt to assemble a substitute stage from older branches.
:::

Source of status: `README.md` and the “Stage 8 — Command Module” and
“Implementation and trust policy” sections of `ROADMAP.md`.

## Why this stage exists

Earlier stages introduce individual security-conscious choices where they help
teach a mechanism. For example, Stage 1 defines dedicated ServiceAccounts with
token automount disabled, while Launchpad hardens its Compose application
containers. Those facts do not prove that the later Stage 7 Kubernetes chart is
hardened. Stage 8 is planned to make security controls consistent, enforced,
observable, and safe to attack in a lab.

## Planned learning sequence

The authoritative roadmap defines four areas:

1. **Identity and workload baseline** — least-privilege RBAC, dedicated
   ServiceAccounts, selective token automount, non-root containers, seccomp,
   dropped capabilities, and read-only filesystems.
2. **Enforced networking** — replace kindnet with Calico, apply default-deny
   and least-privilege NetworkPolicies, then prove allowed and denied flows.
3. **External secrets** — use Vault with External Secrets Operator and observe
   bootstrap, reconciliation, rotation, failure, and recovery.
4. **Admission and supply chain** — introduce Kyverno audit/enforce modes,
   Trivy CI gates, Cosign signing, and observable rejection of unsigned images.

These are roadmap requirements, not current Apollo11 behavior.

## General Kubernetes context

- **RBAC** authorizes API actions. A Role is namespace-scoped; a RoleBinding
  connects permissions to a user, group, or ServiceAccount.
- **Pod Security Admission** evaluates Pods against namespace policy. It is an
  admission control, not a replacement for container-image hardening.
- **NetworkPolicy** declares allowed Pod traffic, but a compatible CNI must
  enforce it. The current kindnet learning cluster does not provide the Stage 8
  enforcement proof.
- **External Secrets Operator** reconciles values from an external provider
  into Kubernetes Secrets. It does not make ordinary Kubernetes Secret objects
  disappear from the runtime cluster.
- **Admission policy and image signing** can reject workloads before scheduling,
  but only after trust roots, identities, and failure/recovery procedures are
  designed.

## Safe investigation: find the current gaps

### Objective

Separate controls verified in earlier snapshots from controls absent in the
Stage 7 chart.

### Starting point

A local Apollo11 checkout; no running cluster is required.

### Instructions

```bash
cd Apollo11

# Stage 1 explicitly disables token automount on its ServiceAccounts.
grep -n "automountServiceAccountToken" stages/stage1/k8s/config/serviceaccounts.yaml

# Inspect the later chart rather than assuming that setting was preserved.
sed -n '1,180p' stages/stage7/helm/apollo11/templates/config/serviceaccount.yaml

# Check application templates for the planned workload-hardening fields.
grep -R -n -E "runAsNonRoot|seccompProfile|readOnlyRootFilesystem|allowPrivilegeEscalation" \
  stages/stage7/helm/apollo11/templates/apps \
  stages/stage7/helm/apollo11/templates/ui || true
```

### Expected result

Stage 1 contains the explicit token-automount setting. The Stage 7 application
chart does not currently preserve all of the planned Stage 8 hardening fields.
That is a documented curriculum gap, not permission to edit the application
repository while following this guide.

### Verification

```bash
test ! -d stages/stage8 && echo "Stage 8 implementation is absent, as documented"
grep -n "Stage 8 is a clean rebuild" ROADMAP.md
```

### Troubleshooting

If `stages/stage8/` now exists, stop using this page as status evidence. Read
its README and verification scripts, then confirm the top-level trust status
before running anything.

### Concept reinforced

Security posture is snapshot-specific. A control demonstrated in one stage
cannot be claimed for another stage unless its manifests and runtime evidence
prove that it carried forward.

## What you learned

- The difference between a planned security architecture and enforced runtime
  behavior.
- Why NetworkPolicy needs an enforcing CNI.
- Why ServiceAccount existence does not by itself prove least privilege.
- How to audit a later deployment snapshot instead of assuming security
  properties were inherited.

Continue to [Stage 9: Cloud Lifecycle Roadmap](./stage-9).
