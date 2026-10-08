---
title: "Stage 8 — Security Enforcement Roadmap"
description: "Planned Apollo11 security stage: what the Stage 7 platform leaves open, which tools will close each gap, and why in that order."
sidebar_label: "Stage 8: Security (Planned)"
---

# Stage 8: Command Module (security)

:::warning[Status: not implemented]
- `stages/stage8/` holds a status placeholder only. The roadmap says Stage 8 is rebuilt from scratch on the verified Stage 7 Helm baseline.
- Nothing on this page is an Apollo11 manifest. Do not assemble a stage from older branches.
- Source: `README.md` and the Stage 8 / "Implementation and trust policy" sections of `ROADMAP.md`.
- Concepts: [Identity and authorization](./learn/security/identity-and-authorization) · [Admission and runtime](./learn/security/admission-and-runtime) · [Network policy](./learn/security/network-policy) · [Secrets and supply chain](./learn/security/secrets-and-supply-chain)
:::

## Where we left off

Stage 7 runs, scales and can be observed, but it trusts everything:

- **Any Pod can talk to any Pod.** The frontend can open a connection to `booking-db` directly. Nothing stops it.
- **Containers run with the image's defaults.** They may run as root, write to their own filesystem, and keep every Linux capability.
- **Secrets are plain Kubernetes Secrets in the chart.** They're base64, rendered from values, and readable by anyone who can read Secrets in the namespace.
- **Any image can run.** Nothing checks where an image came from, or whether it has known vulnerabilities.
- **One thing was done right early:** Stage 1 turned off ServiceAccount token automount, and Stage 7's chart still does. Apps have identities but no API access.

## What changes in this stage (planned)

| Concern | Stage 7 | Stage 8 (planned) | Why it's better |
|---|---|---|---|
| Who may call the Kubernetes API | No tokens mounted; no Roles | **RBAC** Roles and RoleBindings, only where a workload needs API access | Least privilege you can prove with `kubectl auth can-i` |
| What a container may do | Image defaults | `runAsNonRoot`, seccomp `RuntimeDefault`, dropped capabilities, read-only root filesystem | A compromised process can do far less |
| Pod-to-Pod traffic | All allowed (kindnet doesn't enforce policy) | **Calico** CNI + default-deny **NetworkPolicies** with explicit allows | Only booking can reach `booking-db` |
| Secrets | Kubernetes Secret from Helm values | **Vault** + **External Secrets Operator** | The source of truth is outside Git and can be rotated |
| What may be deployed | Anything | **Kyverno** admission policies (audit first, then enforce) | Bad manifests are rejected at the API server |
| Image trust | Whatever tag is in values | **Trivy** scan in CI, **Cosign** signatures checked at admission | Only scanned, signed images run |

## Why in this order

1. **Workload identity and hardening first.** They need no new infrastructure, just chart fields. They also shrink what every later control has to defend.
2. **Then the network.** NetworkPolicy objects do nothing until the CNI enforces them. So the CNI changes from kindnet to Calico *before* any policy is written.
3. **Then secrets.** Vault and ESO add moving parts: bootstrap, sync, rotation, failure. Hardened, policy-limited Pods are a safer place to deliver real secrets to.
4. **Then admission and supply chain last.** Enforcement can block your own deploys. You turn it on only when the earlier controls are stable, and in *audit* mode before *enforce*.

## What the stage must prove before it counts

| Control | Evidence the stage must show |
|---|---|
| RBAC | `kubectl auth can-i` answers yes for the one needed verb and no for the rest |
| Hardening | `touch /x` fails inside a container; `id` shows a non-root UID |
| NetworkPolicy | One allowed path works and one blocked path fails, both tested |
| External secrets | Bootstrap, sync, rotation, a failure, and recovery |
| Admission + signing | An unsigned image is rejected, and a signed one is admitted |

## See where Stage 7 stands today

These read-only commands run against the repo, with no cluster needed:

```bash
grep -n "automountServiceAccountToken" stages/stage7/helm/apollo11/templates/config/serviceaccount.yaml | head -3
grep -R -n -E "runAsNonRoot|seccompProfile|readOnlyRootFilesystem|allowPrivilegeEscalation" \
  stages/stage7/helm/apollo11/templates/apps stages/stage7/helm/apollo11/templates/ui || echo "no hardening fields in Stage 7"
cat stages/stage8/README.md
```

- Automount is off: that control carried forward from Stage 1.
- The hardening `grep` finds nothing. That control never existed.
- With a cluster up, `kubectl get pods -n kube-system` shows `kindnet` and no Calico, so no NetworkPolicy would be enforced.

## The journey so far

| Concern | Stage 1 | Stage 7 | Stage 8 (planned) |
|---|---|---|---|
| Workload identity | ServiceAccount per workload, no token | same | **+ RBAC where needed** |
| Container privileges | image defaults | image defaults | **hardened `securityContext`** |
| Network | flat | flat | **default-deny + allow-list** |
| Secrets | Secret in Git | Secret from Helm values | **Vault + ESO** |
| Admission | none | none | **Kyverno, Cosign** |

## You should now be able to explain

- Which security gaps the Stage 7 platform has, and which control from Stage 1 survived.
- Why NetworkPolicy needs an enforcing CNI before any policy means anything.
- Why hardening comes before secrets, and admission comes last.
- Why a planned control can't be claimed until a stage shows its evidence.

**Next:** [Stage 9](./stage-9) (planned) takes the platform to the cloud.
