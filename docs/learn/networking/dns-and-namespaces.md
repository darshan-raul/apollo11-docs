---
title: "DNS and namespaces"
description: "Understand how Kubernetes DNS search domains make short service names work within a namespace, why they fail across namespaces, and why a successful lookup does not prove a backend is ready."
---

# DNS and namespaces

*Stage 2 · Guidance*

The booking service calls `http://flight:8081/api/flights`. The name `flight` is not a public internet domain; it is an internal hostname resolved by **CoreDNS**, Kubernetes' in-cluster DNS server.

CoreDNS expands short hostnames using the caller's namespace context. When services move into separate namespaces, understanding DNS search domains becomes essential to prevent connection failures.

---

## How CoreDNS search domains expand short names

The kubelet populates `/etc/resolv.conf` inside every container upon boot. For a Pod running in `apollo-airlines-apps`:

~~~text
search apollo-airlines-apps.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
~~~

When `booking` queries `flight`, the resolver checks each domain in the search path sequentially:
- **Step 1**: Appends `apollo-airlines-apps.svc.cluster.local`.
- **Step 2**: Resolves to the Service ClusterIP (`10.96.140.22`).
- **Step 3**: Returns the virtual IP without needing full qualification.

~~~mermaid
sequenceDiagram
  participant App as booking container\n(in apollo-airlines-apps)
  participant CoreDNS as CoreDNS\n(10.96.0.10)
  participant Service as flight Service\n(ClusterIP: 10.96.140.22)
  App->>CoreDNS: query: flight
  Note over CoreDNS: Appends search domain:\nflight.apollo-airlines-apps.svc.cluster.local
  CoreDNS->>App: 10.96.140.22 (flight's ClusterIP)
  App->>Service: TCP connect: 10.96.140.22:8081
~~~

*Diagram NW-04 — short name resolution uses the caller's namespace search domain; packets target the ClusterIP.*

---

## Why cross-namespace calls fail without qualification

When a client in `apollo-airlines-ui` attempts to call `http://identity:8080`:
- The resolver queries `identity.apollo-airlines-ui.svc.cluster.local`.
- No such Service exists in that namespace.
- Resolution fails with `NXDOMAIN`.

To communicate across namespaces, qualify the service name:

| Name format | Resolution path | Where it works |
|---|---|---|
| `identity` | `identity.<caller-ns>.svc.cluster.local` | Same namespace only |
| `identity.apollo-airlines-apps` | `identity.apollo-airlines-apps.svc.cluster.local` | Across any namespace in the cluster |
| `identity.apollo-airlines-apps.svc.cluster.local` | Exact FQDN | Everywhere, without search query overhead |

> **Best practice**: In shared ConfigMaps, always declare service URLs using at least namespace qualification (`http://identity.apollo-airlines-apps:8080`).

---

## Beyond DNS: what namespaces isolate

Namespaces represent logical organizational boundaries, scoping:
- **1. DNS search scopes**: Isolating default hostname lookups.
- **2. RBAC permissions**: Restricting developer and service access to specific environments.
- **3. NetworkPolicies**: Applying firewall and ingress rules to targeted groups of Pods.
- **4. ResourceQuotas & LimitRanges**: Constraining aggregate memory and CPU consumption.

---

## Evidence and limits

A successful DNS query only proves name-to-IP resolution. It does not prove application health:

- **1. Inspect Pod resolver configuration**:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/booking -- cat /etc/resolv.conf
  ```
- **2. Test same-namespace lookup**:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/booking -- nslookup flight
  ```
- **3. Test cross-namespace lookup**:
  ```bash
  kubectl exec -n apollo-airlines-ui curl-client -- nslookup identity.apollo-airlines-apps
  ```
- **4. Inspect endpoints**: If DNS succeeds but calls timeout, check whether the Service has active endpoints:
  ```bash
  kubectl get endpoints flight -n apollo-airlines-apps
  ```
