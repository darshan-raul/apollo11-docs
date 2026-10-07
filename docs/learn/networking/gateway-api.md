---
title: "Gateway API: infrastructure, routes, and permission"
description: "GatewayClass, Gateway, HTTPRoute and ReferenceGrant: who owns what, how attachment and backend permission differ, and how to read status."
---

# Gateway API: infrastructure, routes, and permission

*Stage 2 · Guidance*

:::info[Advanced chapter]
First pass: finish [Ingress and TLS](./ingress-and-tls) and stop. Return here for the full Stage 2 lab, route status, and cross-namespace permission.
:::

**You will be able to:** name which object owns the listener, the route and each permission, read status as a chain, and diagnose a failing host.

## Key points

- Gateway API is a set of **API objects**; the controller and its proxy do the work.
- It is the successor to Ingress. Ingress is frozen, not removed; existing Ingresses do not convert themselves.
- It still needs Services, EndpointSlices, Pods, DNS, certificate Secrets and a running controller.

| Object | Owner | Role |
|---|---|---|
| `GatewayClass` | Infrastructure | Picks the implementation (`controllerName`). Apollo: `eg` (Envoy Gateway) |
| `Gateway` | Platform team | Addresses + **listeners** (port, protocol, hostname, TLS, `allowedRoutes`). Apollo: `apollo-gateway` |
| `HTTPRoute` | App team | Host/path matching + `backendRefs`. `parentRefs` names the Gateway |
| `ReferenceGrant` | Owner of the *referenced* namespace | Allows a cross-namespace backend reference |

## Ingress → Gateway API

| Ingress | Gateway API |
|---|---|
| `IngressClass` | `GatewayClass` |
| Controller-provided 80/443 | `Gateway.spec.listeners` |
| `spec.tls` | HTTPS listener `tls` |
| `rules[].host` | `HTTPRoute.spec.hostnames` |
| path + backend | HTTPRoute `matches` + `backendRefs` |
| Annotations | Typed filters / policy resources |
| `ingressClassName` | `parentRefs` (optionally a `sectionName`) |
| Default backend | Explicit catch-all rule |

- Annotations are a **migration question**: translate to a standard field/filter, use the controller's documented policy, or keep that route on the old controller. Never copy an annotation onto an HTTPRoute and assume it works.

## Three paths to keep separate

```mermaid
flowchart TB
  subgraph Reconcile[Reconciliation]
    GC[GatewayClass] --> Ctl[Controller]
    G[Gateway] --> Ctl
    R[HTTPRoute] --> Ctl
    Ctl --> Proxy[Envoy proxy]
  end
  subgraph Request[Request]
    Browser --> Proxy --> Svc[Service] --> Pod
  end
  subgraph Status[Status]
    Ctl --> GS[Gateway + listener conditions]
    Ctl --> RS[HTTPRoute parent conditions]
  end
```

## Reading the Apollo objects

*Source: `stages/stage2/k8s/substages/05-envoy-gateway/`*

```yaml
# Gateway (listener excerpt)
listeners:
  - name: https
    port: 443
    protocol: HTTPS
    tls: {mode: Terminate, certificateRefs: [{name: apollo-tls-secret}]}
    allowedRoutes: {namespaces: {from: All}}
---
# HTTPRoute
spec:
  parentRefs: [{name: apollo-gateway}]
  hostnames: ["booking.apollo.local"]
  rules: [{backendRefs: [{name: booking, port: 8082}]}]
```

- A connection selects **one listener** (address, port, protocol, hostname). Routes are matched only among those attached to it. There is no fallback to another listener.
- Both sides must agree: the Route says "attach here"; the listener's `allowedRoutes` says who may. `from`: `Same` (default), `All`, or `Selector`.
- Match in order: listener → attachment → hostname intersection → rule matches (path/method/header/query) → filters → backend.
- Overlapping routes are resolved by specificity, then age/name. Avoid designs that depend on tie-breaks.

## Two different permissions

| Question | Mechanism | Lives in | Failure |
|---|---|---|---|
| May this Route **attach** to the listener? | `allowedRoutes` | Gateway's namespace | `Accepted=False` (`NotAllowedByListeners`) |
| May this Route **reference** that Service? | `ReferenceGrant` | Service's namespace | `ResolvedRefs=False` (`RefNotPermitted`) |

- Apollo's frontend Route lives in `apollo-airlines-ui` and attaches to `apollo-gateway` in `apollo-airlines-apps` because of `allowedRoutes: All`. Its backend is in its **own** namespace, so no grant is needed. `01a-referencegrant.yaml` shows the pattern for a cross-namespace backend.
- A grant never attaches a Route and never grants general namespace access.

## Read status as a chain

| Level | Field | Answers |
|---|---|---|
| GatewayClass | `Accepted` | Did a controller take it? |
| Gateway | `Accepted`, `Programmed`, `addresses` | Valid? Sent to the data plane? Which IP? |
| Listener | conditions, `attachedRoutes` | Valid certificate ref? How many routes? |
| HTTPRoute parent | `Accepted`, `ResolvedRefs` | Attached? Backend exists and permitted? |

- Check `observedGeneration` matches the spec you are reading.
- None of these mean a passenger succeeds. DNS, TLS trust, endpoints, policy and the app remain separate.

## Diagnose `booking.apollo.local`

1. GatewayClass accepted? 2. Gateway has address, `Programmed`? 3. HTTPS listener valid, route attached? 4. Route `Accepted` and `ResolvedRefs`? 5. Host/method/path as expected? 6. Service port exists, endpoints ready? 7. From the client: DNS, then TLS cert?

```bash
kubectl get gatewayclass,gateway -A
kubectl get httproute -A
kubectl describe httproute booking -n apollo-airlines-apps | sed -n '/Status:/,$p'
kubectl get endpointslice -n apollo-airlines-apps -l kubernetes.io/service-name=booking
```

## Migrating without a flag day

1. Inventory Ingress hosts, paths, TLS Secrets, annotations, expected responses (including unmatched).
2. Pick an implementation and confirm it supports the features you need.
3. Install CRDs + controller **alongside** the Ingress controller.
4. Create a Gateway on a separate address; convert routes to HTTPRoutes; translate annotations deliberately.
5. Check Gateway and Route status.
6. Replay the same requests against both; compare codes, redirects, headers, certs, backends.
7. Move DNS (or hosts mapping); observe; keep the old path for a rollback window.
8. Remove the Ingress only when nothing depends on it. `ingress2gateway` gives a starting point, never a finished result.

## What it does not promise

- A controller or proxy, public DNS, a trusted/renewed certificate, ready endpoints, policy enforcement, or a successful booking.

## Check yourself

<details>
<summary>A route in <code>ui</code> attaches but its backend in <code>apps</code> is refused. Which object fixes it?</summary>

A `ReferenceGrant` in `apps` allowing HTTPRoutes from `ui` to reference that Service.
</details>

<details>
<summary>Route status shows <code>Accepted=True</code> but requests return 5xx. What do you check?</summary>

`ResolvedRefs` and the backend Service port/endpoints. Attachment and backend resolution are separate.
</details>

## References

- [Gateway API overview](https://kubernetes.io/docs/concepts/services-networking/gateway/) · [Resource model](https://gateway-api.sigs.k8s.io/docs/concepts/api-overview/) · [Migrating from Ingress](https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/) · [Troubleshooting](https://gateway-api.sigs.k8s.io/docs/concepts/troubleshooting/)
