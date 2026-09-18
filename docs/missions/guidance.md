---
title: "Stage 2 — Guidance: Find the Right Way Home"
sidebar_label: "Mission briefing"
---

# Stage 2: Guidance — Find the Right Way Home

Apollo’s Pods are replaceable, so their addresses are temporary. Yet a passenger
expects `booking.apollo.local` to keep working, and the booking service expects
to find flight by name. Guidance follows a request from a client through DNS,
Service selection, node routing, and edge routing without turning any stored API
object into a fictional packet processor.

The important habit here is to keep configuration paths and traffic paths
separate. Controllers record information about usable backends. A real request
then travels through the rules that an implementation has configured.

## What you will understand

1. [Pod network and CNI](../learn/networking/pod-network-and-cni)
2. [Service control path and packet path](../learn/networking/service-control-and-data-paths)
3. [DNS and namespaces](../learn/networking/dns-and-namespaces)
4. [NodePort and LoadBalancer](../learn/networking/nodeport-and-loadbalancer)
5. [Ingress and TLS](../learn/networking/ingress-and-tls)
6. [Gateway API](../learn/networking/gateway-api) — advanced edge model; required
   for the full hands-on lab, optional on a first reading-only pass.

As you read, keep two questions separate: how is a route allowed to use an edge
listener, and how is it allowed to send traffic to an application owned
elsewhere? The final chapter gives those permissions their Kubernetes names.

If this is your first networking pass, stop after Ingress and TLS and confirm
that you can trace DNS → reachable address → edge proxy → Service → ready Pod.
Then read Gateway API as a second pass about ownership and cross-namespace
permission. It is intentionally deeper than the core request-path model.

## When to take the controls

The [Guidance lab](../stage-2) becomes valuable once you can draw the request
path and name the evidence that a Pod is an eligible endpoint. Use it to inspect
DNS answers, routes, and traffic—not to discover what a Service is for.
