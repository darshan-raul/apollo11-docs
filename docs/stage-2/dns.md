---
title: "DNS Resolution in Kubernetes"
description: "How Kubernetes DNS works — from FQDN to ClusterIP, and why cross-namespace calls need full names."
---

# DNS Resolution in Kubernetes

Every Service gets an A record in CoreDNS. Pods use these names to discover services.

---

## How DNS Works

```
Pod calls: catalog.apollo11-apps.svc.cluster.local:8081
    │
    ▼
libc reads /etc/resolv.conf
    nameserver: 10.96.0.10 (CoreDNS)
    search: apollo11-apps.svc.cluster.local ...
    │
    ▼
DNS query → CoreDNS → ClusterIP (10.96.0.180)
    │
    ▼
iptables/IPVS DNATs to backend pod
```

---

## /etc/resolv.conf

```bash
# Pod in apollo11-apps:
nameserver 10.96.0.10
search apollo11-apps.svc.cluster.local apollo11.svc.cluster.local ...

# Pod in apollo11-ui:
nameserver 10.96.0.10
search apollo11-ui.svc.cluster.local ...
```

---

## Same-Namespace vs Cross-Namespace

```bash
# Same namespace (short name works)
nslookup auth
# → Found (search path applies)

# Cross-namespace (needs FQDN)
nslookup auth.apollo11-apps.svc.cluster.local
# → Found (cross-namespace always works)

# From apollo11-ui, "auth" fails (wrong search path)
nslookup auth
# → NXDOMAIN
```

---

## Service Discovery via Environment Variables

Kubernetes injects Service URLs as environment variables:

```bash
env | grep -E "AUTH|CATALOG"
# AUTH_SERVICE_URL=http://auth:8080
# CATALOG_SERVICE_URL=http://catalog:8081
```

> Note: Only Services existing **before** the Pod are injected. Restart Pods to pick up new Services.

---

## Headless Services and DNS

```yaml
spec:
  clusterIP: None  # Headless - DNS returns pod IPs directly
```

```bash
# Normal Service: returns ClusterIP
nslookup auth.apollo11-apps.svc.cluster.local
# Address: 10.96.0.150

# Headless: returns all pod IPs
nslookup auth-postgres-headless.apollo11-infra.svc.cluster.local
# Address: 10.244.1.10
# Address: 10.244.1.11
```

StatefulSets use Headless Services: `auth-postgres-0.headless-svc.ns.svc.cluster.local`

---

## Key Takeaways

```
FQDN format: <service>.<namespace>.svc.cluster.local

Short name works:  Within same namespace
FQDN required:    Cross-namespace

CoreDNS translates FQDN → ClusterIP
Headless (clusterIP: None) → DNS returns pod IPs directly
New Service: Restart Pods to pick up env vars
```