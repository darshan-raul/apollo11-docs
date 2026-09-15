---
title: "DNS Resolution & Cross-Namespace Discovery"
description: "How CoreDNS resolves in-cluster FQDNs, same-namespace vs cross-namespace communication, and EndpointSlice tracking."
---

# DNS Resolution & Cross-Namespace Discovery

In Kubernetes, Pods are ephemeral and their IP addresses are dynamic. Applications must never hardcode Pod IPs. Instead, Kubernetes provides built-in service discovery through **CoreDNS** and **ClusterIP Services**.

This section corresponds to **Substage 1 (`01-internal-dns`)** of the Stage 2 networking ladder.

---

## How In-Cluster DNS Works

When a Service is created, CoreDNS automatically assigns it an internal A/AAAA record:

```text
Pod calls: identity.apollo-airlines-apps.svc.cluster.local:8080
    │
    ▼
Linux libc reads /etc/resolv.conf inside the container
    nameserver: 10.96.0.10 (CoreDNS ClusterIP)
    search: apollo-airlines-apps.svc.cluster.local svc.cluster.local cluster.local
    │
    ▼
CoreDNS responds with Service ClusterIP (e.g., 10.96.120.45)
    │
    ▼
kube-proxy (iptables / IPVS) intercepts packets to ClusterIP
    │
    ▼
DNAT load-balances packets directly to a healthy backend Pod IP
```

---

## Inside `/etc/resolv.conf`

Every Pod automatically inherits a `/etc/resolv.conf` file configured by the `kubelet`:

```bash
# In a Pod running in namespace "apollo-airlines-apps":
nameserver 10.96.0.10
search apollo-airlines-apps.svc.cluster.local svc.cluster.local cluster.local
options ndots:5

# In a Pod running in namespace "apollo-airlines-ui":
nameserver 10.96.0.10
search apollo-airlines-ui.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

### Same-Namespace vs Cross-Namespace Name Resolution

1. **Same-Namespace Calls (Short Names Work):**
   When `booking` in `apollo-airlines-apps` calls `http://flight:8081`:
   - The OS appends the first search domain: `flight` + `.apollo-airlines-apps.svc.cluster.local`.
   - CoreDNS resolves it immediately.

2. **Cross-Namespace Calls (Require FQDN):**
   When `frontend` in `apollo-airlines-ui` calls `identity` in `apollo-airlines-apps`:
   - A short query for `http://identity:8080` resolves to `identity.apollo-airlines-ui.svc.cluster.local` (which does not exist -> **NXDOMAIN**).
   - Cross-namespace calls must specify the namespace:
     ```text
     http://identity.apollo-airlines-apps:8080
     # Or full FQDN:
     http://identity.apollo-airlines-apps.svc.cluster.local:8080
     ```

---

## Hands-On Lab: Substage 1

### 1. Deploy Substage 1

Deploy the baseline workloads and the interactive diagnostic `curl-client`:

```bash
./stages/stage2/scripts/apply.sh --substage 1 --skip-build
```

### 2. Inspect CoreDNS and Endpoints

Inspect the services and backing endpoints in the backend namespace:

```bash
# View services and their virtual ClusterIPs
kubectl get services -n apollo-airlines-apps

# View the matching endpoints (real Pod IPs)
kubectl get endpoints -n apollo-airlines-apps

# Inspect modern EndpointSlices
kubectl get endpointslices -n apollo-airlines-apps -l kubernetes.io/service-name=identity
```

### 3. Test Cross-Namespace Resolution from `curl-client`

Exec into `curl-client` (running in the `apollo-airlines-ui` namespace):

```bash
# 1. Test short name (EXPECTED FAILURE: NXDOMAIN)
kubectl exec -n apollo-airlines-ui curl-client -- \
  curl -s --connect-timeout 2 http://identity:8080/healthz || echo "Failed as expected: short name not in search path"

# 2. Test cross-namespace FQDN (SUCCESS)
kubectl exec -n apollo-airlines-ui curl-client -- \
  curl -s http://identity.apollo-airlines-apps.svc.cluster.local:8080/healthz
# Returns: {"status":"OK"}

# 3. Resolve DNS records directly with getent
kubectl exec -n apollo-airlines-ui curl-client -- \
  getent hosts identity.apollo-airlines-apps.svc.cluster.local
```

---

## Break & Recover: Broken Selector Experiment

Let's test what happens when a Service selector breaks.

### 1. Break the Selector

Patch the `identity` service to select a nonexistent label:

```bash
kubectl patch service identity -n apollo-airlines-apps \
  --type='json' -p='[{"op": "replace", "path": "/spec/selector/app", "value": "identity-broken"}]'
```

Inspect endpoints:

```bash
kubectl get endpoints identity -n apollo-airlines-apps
# NAME       ENDPOINTS   AGE
# identity   <none>      ...
```

The endpoints immediately drop to `<none>`. Attempt a curl from `curl-client`:

```bash
kubectl exec -n apollo-airlines-ui curl-client -- \
  curl -s --connect-timeout 3 http://identity.apollo-airlines-apps.svc.cluster.local:8080/healthz || echo "Connection failed!"
```

The request fails because the Service has no healthy backend IPs to route to.

### 2. Recover the Selector

Restore the correct label selector:

```bash
kubectl patch service identity -n apollo-airlines-apps \
  --type='json' -p='[{"op": "replace", "path": "/spec/selector/app", "value": "identity"}]'
```

Verify recovery:

```bash
kubectl get endpoints identity -n apollo-airlines-apps
# Endpoints reappear with healthy Pod IPs!

kubectl exec -n apollo-airlines-ui curl-client -- \
  curl -s http://identity.apollo-airlines-apps.svc.cluster.local:8080/healthz
# Returns: {"status":"OK"}
```

---

## Key Takeaways

- CoreDNS dynamically creates DNS records matching `<svc>.<ns>.svc.cluster.local` for every Service.
- Short names work only within the same namespace; cross-namespace communication must include the target namespace.
- Services do not run containers; they are virtual IPs mapped to real Pod IPs via EndpointSlices.
- If a Service selector has a typo, Kubernetes accepts the manifest, but EndpointSlices remain `<none>` and traffic drops silently.