---
title: "Gateway API: infrastructure, routes, and permission"
description: "Start with a passenger at Apollo’s front door, then build the Gateway API model one object and one permission at a time."
---

# Gateway API: infrastructure, routes, and permission

*Stage 2 · Guidance*

A passenger types **booking.apollo.local** into a browser. Apollo needs an edge
component that receives the HTTP request, decides which route it matches, and
forwards it toward booking. It also needs a safe way for the team operating edge
infrastructure and the team owning booking to work without giving each other
unrestricted control of every route.

Gateway API describes that arrangement. It becomes much clearer when we start
with the running pieces, then add configuration objects one at a time.

## First, there must be a running implementation

Kubernetes does not turn an HTTPRoute into a proxy by itself. Gateway API’s
custom resource definitions add new types of stored object to the API. A Gateway
API **controller**, such as Envoy Gateway, is the running implementation that
watches those objects and configures a data-plane proxy to handle traffic.

A **GatewayClass** names the kind of gateway implementation that a platform team
offers. A **Gateway** asks that implementation for a concrete set of listeners:
HTTP or HTTPS ports, hostnames, certificates, and rules about who may attach
routes.

~~~mermaid
flowchart LR
  GC[GatewayClass names an implementation] --> G[Gateway requests listeners]
  G --> C[Gateway controller]
  C --> P[Running data-plane proxy]
  Browser[Passenger browser] --> P
~~~

*Diagram NW-09 — GatewayClass and Gateway are configuration; the controller and
proxy are the active participants that make a listener useful.*

## Then the application team describes a route

An **HTTPRoute** says how to match an HTTP request and which backend Service
should handle a match. It points to a Service, not directly to a temporary Pod
IP. The Service and endpoint machinery from earlier Guidance chapters continue
to select a ready Pod behind that stable name.

This **conceptual example** keeps the Gateway, HTTPRoute, and booking Service in
one namespace so we can focus on the basic path:

~~~yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: booking
  namespace: apollo-airlines-apps
spec:
  parentRefs:
    - name: apollo-gateway
  hostnames:
    - booking.apollo.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api/bookings
      backendRefs:
        - name: booking
          port: 8082
~~~

Read it as a sentence: matching requests for the booking hostname and API path
should attach to **apollo-gateway**, then go to the **booking** Service on port
8082. The controller reads that configuration and updates its proxy. When the
passenger sends a matching request, the proxy forwards it to the Service; Service
routing then selects a ready booking Pod.

~~~mermaid
sequenceDiagram
  participant B as Passenger browser
  participant P as Gateway proxy
  participant S as booking Service
  participant K as Node routing
  participant Pod as ready booking Pod
  B->>P: HTTPS request for booking.apollo.local
  P->>S: matched HTTPRoute backend
  S->>K: Service virtual address
  K->>Pod: selected endpoint
  Pod-->>B: booking response
~~~

*Diagram NW-10 — the route configures a proxy; after the proxy, Service routing
still selects a ready Pod.*

## Attachment is one permission question

A Gateway may belong to a platform namespace while an application team owns its
HTTPRoute somewhere else. The Gateway listener controls whether that route may
attach with **allowedRoutes**. It answers: “May a Route from this namespace use
this Gateway listener?”

A listener can restrict attachment to its own namespace, allow all namespaces,
or allow namespaces selected by labels. The route’s parent status reports whether
the controller accepted that attachment. An HTTPRoute can exist in the API and
still not be attached to any listener.

## Backend references are a different permission question

A route can point to a Service in another namespace. That is a separate trust
decision: “May this Route refer to that backend object?” The backend namespace
grants that permission with a **ReferenceGrant**.

A ReferenceGrant does not attach a route to a Gateway; **allowedRoutes** still
answers that earlier question. This distinction matters in Apollo: a frontend
route might attach across namespaces while sending traffic to a frontend Service
in its own namespace. It needs attachment permission, but it does not need a
ReferenceGrant. A route pointing across namespaces to a Service does.

~~~mermaid
flowchart TB
  Route[HTTPRoute in application namespace] -->|attachment request| Listener[Gateway listener]
  Listener -->|allowedRoutes decides| Attached{Attached?}
  Route -->|same namespace backend| Same[booking Service]
  Route -->|cross-namespace backend| Grant{ReferenceGrant permits?}
  Grant --> Other[Service in another namespace]
~~~

*Diagram NW-11 — attachment and backend reference are independent relationships
with different objects deciding them.*

## What to inspect

Gateway API exposes status so you do not have to guess from YAML:

1. Inspect Gateway status and listener conditions. Did the controller accept the
   listeners and assign an address?
2. Inspect HTTPRoute parent status. Did the intended Gateway accept attachment?
3. Inspect backend-reference status, then the referenced Service and ready
   endpoints.
4. Make a request with the intended hostname and path.

A route can be accepted while its Service has no ready endpoints. A Gateway can
have an address while DNS or TLS still prevents a browser from reaching it. Those
are separate links in the passenger’s path.

## What Gateway API does not promise

Gateway API describes desired edge routing. It does not provide a controller,
public DNS, a trusted certificate, NetworkPolicy enforcement, or a healthy
backend by itself. A local lab address and self-signed TLS can demonstrate the
path, but they do not establish an internet-facing production boundary.


