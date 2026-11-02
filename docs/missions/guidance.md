---
title: "Stage 2 — Guidance: Find the Right Way Home"
sidebar_label: "Mission briefing"
---

# Stage 2 · Guidance: networking

**Problem:** Pod IPs change, yet `booking.apollo.local` must keep working and booking must find flight by name.

## Chapters

1. [Pod network and CNI](../learn/networking/pod-network-and-cni)
2. [Service control path vs packet path](../learn/networking/service-control-and-data-paths)
3. [Endpoints and EndpointSlices](../learn/networking/endpoints-and-endpointslices)
4. [DNS and namespaces](../learn/networking/dns-and-namespaces)
5. [NodePort and LoadBalancer](../learn/networking/nodeport-and-loadbalancer)
6. [Ingress and TLS](../learn/networking/ingress-and-tls)
7. [Gateway API](../learn/networking/gateway-api): second pass; needed for the full walkthrough.

First pass: stop after chapter 6. You are done when you can trace **DNS → address → edge proxy → Service → ready Pod**.

## Ready for the walkthrough when you can answer

- A Service is data, not a process: what turns it into forwarded packets?
- What decides whether a Pod is an endpoint of a Service, and what do `ready`, `serving` and `terminating` mean in its EndpointSlice?
- What name does booking use to reach flight in another namespace?
- NodePort vs LoadBalancer: who allocates the address, and why does booking see the node's IP instead of the client's?
- Who may attach a route to a Gateway? Who may send traffic to a Service in another namespace?

## Walkthrough

- [Stage 2 walkthrough](../stage-2)
