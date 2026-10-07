---
title: "Stage 2 — Guidance: Find the Right Way Home"
sidebar_label: "Mission briefing"
---

# Stage 2 · Guidance: networking

**Problem:** Pod IPs change, yet `booking.apollo.local` must keep working and booking must find flight by name.

## Chapters

1. [Pod network and CNI](../learn/networking/pod-network-and-cni)
2. [Service control path vs packet path](../learn/networking/service-control-and-data-paths)
3. [DNS and namespaces](../learn/networking/dns-and-namespaces)
4. [NodePort and LoadBalancer](../learn/networking/nodeport-and-loadbalancer)
5. [Ingress and TLS](../learn/networking/ingress-and-tls)
6. [Gateway API](../learn/networking/gateway-api): second pass; needed for the full lab.

First pass: stop after chapter 5. You are done when you can trace **DNS → address → edge proxy → Service → ready Pod**.

## Ready for the lab when you can answer

- What decides whether a Pod is an endpoint of a Service?
- What name does booking use to reach flight in another namespace?
- NodePort vs LoadBalancer: who allocates the address?
- Who may attach a route to a Gateway? Who may send traffic to a Service in another namespace?

## Lab

- [Build Stage 2](../stage-2)
