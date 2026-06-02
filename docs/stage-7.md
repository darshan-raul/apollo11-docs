---
title: "Stage 7: Orbital Maneuvering — Scaling"
description: "Automatically scale workloads with HPA and VPA, control pod placement with taints/tolerations and affinity rules."
---

# Stage 7: Orbital Maneuvering — Scaling

**Goal:** Automatically scale applications based on demand, control which nodes pods run on.

---

## What You'll Learn

| Concept | What It Does |
|---|---|
| **HorizontalPodAutoscaler (HPA)** | Scale pods in/out based on CPU/memory |
| **VerticalPodAutoscaler (VPA)** | Adjust resource requests for running pods |
| **Taints and Tolerations** | Prevent pods from running on specific nodes |
| **Node Affinity** | Influence which nodes pods prefer to run on |
| **Pod Affinity/Anti-Affinity** | Co-locate or separate pods |

---

## Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Taints and Tolerations

**Taints** repel pods from nodes. **Tolerations** allow pods to tolerate taints.

```bash
# Taint a node
kubectl taint nodes node-1 disk=ssd:NoSchedule
```

```yaml
tolerations:
  - key: "disk"
    operator: "Equal"
    value: "ssd"
    effect: "NoSchedule"
```

---

## Node Affinity vs Taints

| Feature | Use When |
|---------|----------|
| **Node Affinity** | You want to PREFER certain nodes |
| **Taints + Tolerations** | You want to REPEL from nodes |

---

## Key Takeaways

```
HPA:      Scales replicas based on CPU/memory utilization
VPA:      Adjusts resource requests for running pods

Taints:   Applied to nodes (repel pods)
Tolerations: Applied to pods (ignore taints)

Node Affinity:     Prefer/require pods on specific nodes
Pod Anti-Affinity: Spread pods across nodes (HA)
Pod Affinity:      Co-locate pods together
```

---

## What's Next

Stage 8 introduces **Command Module Hardening** — RBAC, SecurityContext, Vault, and OPA.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.