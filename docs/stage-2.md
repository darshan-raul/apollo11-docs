---
title: Stage 2 — Guidance, Navigation & Control
description: Progress from internal DNS to external HTTP routing with Traefik, MetalLB, TLS, and Gateway API.
---

# Stage 2 — Guidance, Navigation & Control

Stage 2 is an access ladder. Do not jump straight to an Ingress: first understand how a ClusterIP Service works, then add host access, an HTTP router, an address allocator, and finally the canonical Envoy Gateway API path.

## The ladder

| Set | Mechanism | Question |
| --- | --- | --- |
| 1 | ClusterIP + CoreDNS | How does one Pod find another? |
| 2 | NodePort | How does a host reach a Service port? |
| 3 | Traefik Ingress + local TLS | How are host/path rules evaluated? |
| 4 | MetalLB + LoadBalancer | Who allocates a local external IP? |
| 5 | Envoy Gateway API | How are Gateway, HTTPRoute, and backend references separated? |

## Build

Use the full Stage 2 flow or one set at a time:

```bash
cd Apollo11
bash stages/stage2/scripts/apply.sh
bash stages/stage2/scripts/verify.sh
```

For focused labs, use `stages/stage2/set1-baseline` through `set5-envoy-gateway`, each with its own `apply.sh`, `verify.sh`, and `teardown.sh`.

## Concepts: the networking path

`ClusterIP` is a virtual Service IP; CoreDNS resolves `booking.apollo-airlines.svc.cluster.local` to it. `NodePort` adds a port on every node. `LoadBalancer` asks an implementation such as MetalLB to assign an external address; Kubernetes alone does not allocate one on kind. The request path is client → listener/controller → Service → EndpointSlice → ready Pod.

An Ingress is a routing API consumed by a controller. Gateway API separates infrastructure (`GatewayClass`, `Gateway`) from routes (`HTTPRoute`). A cross-namespace backend needs a `ReferenceGrant`; without it the route may be accepted syntactically but report `ResolvedRefs=False`. `Accepted=True` means the route was accepted, `Programmed=True` means the listener was configured, and `ResolvedRefs=True` means its backend references are valid. TLS also needs both a certificate/key Secret and a listener configured to use it.

### Set 1: ClusterIP and DNS

Start with traffic that never leaves the cluster. A client Pod asks CoreDNS for `flight.apollo-airlines-apps.svc.cluster.local`. CoreDNS returns the Service ClusterIP. The Service dataplane chooses one ready EndpointSlice address, and the packet reaches a Pod. The client does not need to know which Pod is serving the request.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: flight
  namespace: apollo-airlines-apps
spec:
  type: ClusterIP
  selector:
    app: flight
  ports:
    - name: http
      port: 8081
      targetPort: http
```

The named `targetPort: http` resolves to a named container port on matching Pods. Numeric ports are also valid. The important distinction is client-facing `port` versus workload-facing `targetPort`. The Service selects by labels, not by Deployment name.

### Set 2: NodePort

NodePort adds a port from a configured range to every node. A request to a node's address and that port is forwarded to the Service's ready endpoints. In kind, the `extraPortMappings` in Ignition map host ports to node container ports. That is why the laptop can reach `127.0.0.1:30081` without knowing a Pod IP.

NodePort is easy to understand but is not usually the final public edge: every node becomes an entry point, port management is manual, and TLS/routing concerns remain in the application or another proxy.

### Set 3: Ingress and local TLS

An Ingress is a desired routing rule, not the router itself. Traefik watches Ingress objects and configures its data plane. The `host` field selects a hostname; `path` selects a URL path; `backend.service.name` and `backend.service.port` select the internal destination.

For local TLS, the client hostname must match the certificate and resolve to the local listener. `/etc/hosts` is a local mapping, not DNS for the cluster. A missing or wrong TLS Secret can produce a default certificate even while the Ingress object remains present.

### Set 4: MetalLB and LoadBalancer

Kubernetes defines the `LoadBalancer` Service type but does not know how to allocate an address on a bare-metal or kind network. MetalLB watches for LoadBalancer Services, chooses an address from an `IPAddressPool`, and advertises it using an `L2Advertisement`.

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: apollo-pool
  namespace: metallb-system
spec:
  addresses:
    - 172.18.0.50-172.18.0.100
```

The address range must be reachable on the kind Docker network and must not overlap another device. An allocated external IP proves MetalLB assigned an address; it does not prove the controller behind the Service is healthy.

### Set 5: Gateway API ownership

Gateway API is intentionally split between platform and application concerns. A `GatewayClass` names the controller implementation. A `Gateway` asks that controller for listeners and addresses. An `HTTPRoute` attaches host/path rules to a listener and references backend Services. `ReferenceGrant` is an explicit permission for a cross-namespace reference.

```yaml
kind: HTTPRoute
spec:
  parentRefs:
    - name: apollo-gateway
      namespace: apollo-airlines-gateway
  hostnames: [identity.apollo.local]
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: identity
          namespace: apollo-airlines-apps
          port: 8080
```

This route may be rejected if the parent listener does not allow the namespace, the backend namespace has no ReferenceGrant, the Service/port is wrong, or the GatewayClass controller is absent. Read status conditions rather than inferring success from object creation.

### Why NetworkPolicy is deferred

NetworkPolicy objects describe allowed ingress and egress, but enforcement belongs to the network plugin. Apollo11's local kindnet configuration does not enforce the policy behavior required for a meaningful break/recover lab. Applying an inert policy and claiming traffic was blocked would teach the wrong lesson. The source roadmap defers the behavioral lab to the security rebuild with a capable CNI.

## Inspect, break, recover

Inside a temporary Pod, query the DNS name and inspect endpoints:

```bash
kubectl get svc,endpointslice -A
kubectl run dns-test --rm -it --restart=Never --image=busybox:1.36.1 -- nslookup identity.apollo-airlines-apps.svc.cluster.local
```

Break a Service selector and observe `<none>` endpoints; restore the selector. In Set 2, change a `targetPort` to `9999`, observe connection failure, then restore it. In Set 3, delete the local TLS Secret and inspect the fallback certificate. In Set 4, delete `apollo-pool` and watch the LoadBalancer address become pending; reapply `01-ip-pool.yaml`.

For Set 5, inspect status conditions and deliberately break a route backend port:

```bash
kubectl get gateway,httproute -A
kubectl describe httproute -n apollo-airlines-ui frontend
kubectl patch httproute frontend -n apollo-airlines-ui --type=json -p='[{"op":"replace","path":"/spec/rules/0/backendRefs/0/port","value":9999}]'
kubectl get httproute frontend -n apollo-airlines-ui -o yaml
```

Restore the port from the source manifest and prove the route with `curl`. Read `Accepted`, `Programmed`, and `ResolvedRefs`; an object existing is not proof that traffic works.

### Network debugging ladder

When an external request fails, work inward:

1. Resolve the hostname from the client machine.
2. Check the Gateway/Ingress listener and external address.
3. Check route status conditions.
4. Check the backend Service and its `port`/`targetPort`.
5. Check EndpointSlices and ready Pod labels.
6. Curl the backend directly with port-forward or from a debug Pod.
7. Inspect controller logs and events only after identifying which boundary failed.

This prevents treating every `502` as an application bug. A route with an unresolved backend, a Service with zero endpoints, and a Pod returning an HTTP error are three different failures with three different fixes.

### Common Stage 2 failure table

| Symptom | Check | Meaning |
| --- | --- | --- |
| DNS name not found | `nslookup`, CoreDNS Pods/logs | Name, namespace, or DNS system is wrong |
| Service has no endpoints | Selector and Pod labels | Membership contract is broken or Pods are unready |
| NodePort connection refused | Node mapping, Service port, endpoints | Host-to-node or Service path is absent |
| LoadBalancer pending | MetalLB pool/controller/events | No address allocator or exhausted/invalid pool |
| Route `ResolvedRefs=False` | Route condition + ReferenceGrant | Backend reference is invalid or unauthorized |
| TLS default certificate | Secret name/data and listener | Controller is serving fallback certificate |
| HTTP 502 | Route, Service, EndpointSlice, Pod logs | Proxy cannot reach a usable backend |

## Gotchas

- `localhost` from your laptop is not a Pod address; use port-forward, NodePort, or the external listener.
- A Service selector is not an ownership relationship; it is a live membership query.
- Hostnames such as `identity.apollo.local` need `/etc/hosts` entries or another resolver.
- kindnet does not enforce NetworkPolicy. Stage 2 keeps policies reference-only and defers behavioral enforcement.
- Gateway API CRDs and the controller must exist before Gateway resources can become programmed.

```bash
bash stages/stage2/scripts/teardown.sh
```

Continue to [Stage 3](./stage-3).
