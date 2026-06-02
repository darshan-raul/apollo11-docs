---
title: "Stage 8: Command Module — Security"
description: "Implement RBAC, secure pods with SecurityContext, manage secrets with Vault, and enforce policies with OPA."
---

# Stage 8: Command Module — Security

**Goal:** Implement fine-grained access control, secure pod configurations, manage secrets, and enforce policy-as-code.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| **RBAC** | Role, RoleBinding | Fine-grained access control |
| **SecurityContext** | pod.spec.securityContext | Container-level security |
| **Secrets** | Vault, Sealed Secrets | Secure secret management |
| **TLS** | cert-manager | Automated certificates |
| **Policy-as-Code** | OPA, Kyverno | Enforce compliance |

---

## RBAC

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: auth-reader
  namespace: apollo11-apps
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]
```

---

## SecurityContext

```yaml
spec:
  securityContext:
    runAsNonRoot: true
  containers:
    - name: auth
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
```

---

## Pod Security Admission

Built-in policy (k8s 1.25+):

```yaml
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted
```

---

## Key Takeaways

```
RBAC:         Role (namespace) + ClusterRole (cluster)
SecurityContext: Pod-level and container-level hardening
Sealed Secrets:  Encrypt secrets in git
cert-manager:   Automated TLS via Let's Encrypt
OPA:            Policy-as-code for admission control
```

---

## What's Next

Stage 9 introduces **Lunar Orbit** — deploying Kubernetes on cloud providers (EKS/GKE/AKS).

---

## Coming Soon

Hands-on labs for this stage are currently being developed.