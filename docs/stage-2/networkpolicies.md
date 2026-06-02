---
title: "NetworkPolicies — Restricting Pod-to-Pod Traffic"
description: "Use NetworkPolicies to enforce default-deny and allowlist traffic between pods."
---

# NetworkPolicies

By default, all pods can communicate. NetworkPolicies let you restrict this.

---

## Default-Deny Pattern

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: apollo11-apps
spec:
  podSelector: {}          # Empty = ALL pods
  policyTypes:
    - Ingress             # Default-deny all inbound
```

---

## Allowlisting Traffic

```yaml
spec:
  podSelector:
    matchLabels:
      app: auth-postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: apollo11-apps   # Must match namespace label
          podSelector:
            matchLabels:
              app: auth             # Must match pod label
```

---

## Key Concepts

### namespaceSelector vs podSelector

| Selector | What it matches |
|----------|-----------------|
| `namespaceSelector` | The namespace the traffic **originates from** |
| `podSelector` | The pods **within that namespace** |

Both must match for the rule to allow traffic.

---

## Apollo11 NetworkPolicy Architecture

```
apollo11-infra:  auth-postgres ← allow from [auth] in apollo11-apps
                catalog-postgres ← allow from [catalog] in apollo11-apps
                ...

apollo11-apps:  auth ← allow from [frontend] in apollo11-ui
                catalog ← allow from [frontend] in apollo11-ui
                ...

apollo11-ui:    frontend — no ingress restrictions (public-facing)
```

---

## CNI Support

NetworkPolicies require CNI support:

| CNI | Support |
|-----|---------|
| Calico | ✅ Full |
| Cilium | ✅ Full |
| Flannel | ❌ |

---

## Key Takeaways

```
NetworkPolicy lives in SAME namespace as pods it protects
namespaceSelector: match by namespace label (add name: xxx explicitly)
podSelector: match by pod label within that namespace

Default-deny: Apply deny-all ingress, then explicitly allow required traffic
ingress: empty {} = allow all
ingress: [] (no rules) = deny all

NodePort bypasses pod-level NetworkPolicy (node-level)
```