---
title: "Stage 8 — Security Enforcement Roadmap"
description: "Planned Apollo11 security stage, its trust boundary, and an audit you can run today."
sidebar_label: "Stage 8: Security (Planned)"
---

# Stage 8: Command Module (security)

:::warning[Status: not implemented]
- `stages/stage8/` holds a status placeholder only. The roadmap says Stage 8 is rebuilt from scratch on the verified Stage 7 Helm baseline.
- Examples on this page are **not** Apollo11 manifests. Do not assemble a stage from older branches.
- Source: `README.md` and the Stage 8 / "Implementation and trust policy" sections of `ROADMAP.md`.
:::

**You will be able to:** list what Stage 8 will add, and audit the Stage 7 chart for the controls it lacks.

## Planned scope

| Area | Planned control | Proof the lab must give |
|---|---|---|
| Identity + workload baseline | Least-privilege RBAC, per-service ServiceAccounts, token automount only where needed, `runAsNonRoot`, seccomp, dropped capabilities, read-only rootfs | `auth can-i` results; `touch` fails on rootfs |
| Enforced networking | Replace kindnet with **Calico**; default-deny + least-privilege NetworkPolicies | One blocked and one allowed path, both tested |
| External secrets | **Vault** + External Secrets Operator | Bootstrap, reconcile, rotate, failure, recovery |
| Admission + supply chain | **Kyverno** (audit → enforce), Trivy in CI, Cosign signing | An unsigned image rejected |

## Background (one line each)

- **RBAC:** which API verbs are allowed. `Role` is namespaced; `RoleBinding` attaches it.
- **Pod Security Admission:** namespace-level admission check. Does not replace hardening.
- **NetworkPolicy:** needs an enforcing CNI. kindnet cannot show it.
- **External Secrets Operator:** copies external values into ordinary Kubernetes Secrets, which still exist in-cluster.
- **Admission + signing:** only works once trust roots, identities and failure procedures are designed.

## Exercise: audit the gap (no cluster needed)

**Goal:** prove which controls survived to Stage 7 and which never existed.
**Time:** ~5 min

1. **Predict:** Stage 1 disabled token automount. Does Stage 7's chart still do it? Does it set `runAsNonRoot`?
2. **Do:**

```bash
cd Apollo11
grep -n "automountServiceAccountToken" stages/stage1/k8s/config/serviceaccounts.yaml | head -3
sed -n '1,60p' stages/stage7/helm/apollo11/templates/config/serviceaccount.yaml
grep -R -n -E "runAsNonRoot|seccompProfile|readOnlyRootFilesystem|allowPrivilegeEscalation" \
  stages/stage7/helm/apollo11/templates/apps stages/stage7/helm/apollo11/templates/ui || echo "NO hardening fields in Stage 7 templates"
```

3. **Check:**
   - Automount is off in Stage 1 **and** Stage 7.
   - The `grep` finds nothing: no `securityContext` hardening.
4. **Verify the project's own status:**

```bash
cat stages/stage8/README.md
grep -n "Stage 8 is a clean rebuild" ROADMAP.md
```

5. **Why:** security posture belongs to a **snapshot**. A control shown in one stage cannot be claimed in another unless its manifests and runtime evidence show it.
6. **Your turn:** produce a three-row table "Control · Present in Stage 7? · Evidence" for token automount, container hardening and NetworkPolicy enforcement. The third needs a command that shows the CNI.

<details>
<summary>Answer</summary>

| Control | Present? | Evidence |
|---|---|---|
| Token automount off | Yes | `grep automountServiceAccountToken` on the ServiceAccounts |
| Container hardening | No | Empty `grep` above |
| NetworkPolicy enforced | No | `kubectl get pods -n kube-system` shows `kindnet`, no Calico |
</details>

## You can now

- [ ] Tell planned security from enforced security.
- [ ] Say why NetworkPolicy needs an enforcing CNI.
- [ ] Audit a later snapshot instead of assuming inheritance.

Next: [Stage 9](./stage-9).
