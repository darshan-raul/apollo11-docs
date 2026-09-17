---
title: NodePort and LoadBalancer
---

# NodePort and LoadBalancer

NodePort exposes a Service on a port on each node. In kind, a host-port mapping is an additional hop from laptop to node; it is not created by the NodePort object. LoadBalancer asks an implementation to provide an external address. In a local lab, MetalLB’s controller, address pool, and advertisement mechanism supply that implementation.

## In the Guidance mission

A NodePort exposes a Service through a port on each Kubernetes node. In the
local kind lab, the laptop may first pass through a Docker port mapping before
reaching that node port. Those are two hops maintained by different systems.
A LoadBalancer Service asks an implementation for an external address; MetalLB
can provide that implementation in a local cluster.

## Evidence and limit

Inspect the Service status, the configured kind mapping, and the address you
actually contact. An assigned external address does not prove DNS, TLS, firewall
rules, or a healthy backend. It only describes one part of the passenger’s path.
