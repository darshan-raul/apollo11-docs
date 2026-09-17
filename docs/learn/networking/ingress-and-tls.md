---
title: Ingress and TLS
---

# Ingress and TLS

An Ingress is routing configuration. An Ingress controller watches it; that controller’s proxy handles HTTP traffic. TLS terminates where the proxy is configured to terminate it. A locally trusted or self-signed certificate can demonstrate encryption but does not establish public trust, certificate rotation, or internet availability.

## In the Guidance mission

An Ingress stores HTTP routing rules. An Ingress controller watches those rules,
and its proxy is the running component that receives HTTP traffic. TLS ends where
that proxy is configured to terminate it. This separates a route declaration
from the process that enforces it.

## Evidence and limit

A locally trusted or self-signed certificate can demonstrate encrypted transport
for a lab. It does not establish a public trust chain, internet reachability,
certificate renewal, or the availability of the controller itself.
