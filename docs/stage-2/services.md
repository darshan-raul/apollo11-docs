---
title: "Service Types Deep Dive"
description: "ClusterIP, NodePort, LoadBalancer, and Headless — when to use each."
---

# Service Types Deep Dive

A Service provides a stable network endpoint that load-balances traffic to backend Pods.

---

## ClusterIP (Default)

Internal only — traffic can't reach the cluster from outside.

```yaml
spec:
  type: ClusterIP
  selector:
    app: identity
  ports:
    - port: 8080
      targetPort: 8080
```

```
Pod → ClusterIP (virtual IP) → iptables → backend pod
```

---

## NodePort

Exposes a port on every node's external interface (30000-32767).

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```

```
External → node:30080 → kube-proxy → backend pod
```

---

## LoadBalancer

Provisions an external load balancer (cloud provider dependent).

```yaml
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 80
```

```
External → cloud LB → backend pod
```

---

## Headless (clusterIP: None)

No ClusterIP — DNS returns pod IPs directly.

```yaml
spec:
  clusterIP: None
```

```bash
nslookup identity-db-headless.apollo11-infra.svc.cluster.local
# Address: 10.244.1.10  (pod IP, not ClusterIP)
```

**Use case:** StatefulSets for stable pod identity.

---

## Service Type Comparison

| Type | External Access | Use Case |
|------|----------------|----------|
| **ClusterIP** | No (internal only) | Internal microservice communication |
| **NodePort** | Yes (30000-32767) | Dev/testing |
| **LoadBalancer** | Yes (cloud-managed) | Production on cloud |
| **Headless** | No | StatefulSets, peer discovery |

---

## Key Takeaways

```
ClusterIP:    Virtual IP managed by iptables/IPVS
NodePort:     Exposes port on EVERY node (30000-32767)
LoadBalancer: Provisions cloud LB
Headless:     No ClusterIP - DNS returns pod IPs (StatefulSets)
```