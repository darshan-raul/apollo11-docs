---
title: NetworkPolicy
---

# NetworkPolicy

NetworkPolicy expresses allowed traffic selection. Its actual enforcement depends on a CNI that implements it. It is not an identity system, an edge firewall, or a substitute for application authorization. Test both allowed and denied paths and account for DNS and monitoring traffic.

## In the Command Module

A NetworkPolicy selects Pods and declares which ingress or egress traffic is
allowed. Enforcement depends on the CNI implementation in the cluster. It
expresses network paths, not a user’s identity or an application’s authorization
rules. DNS and observability traffic often need deliberate treatment too.

## Evidence and limit

Test an allowed path and a denied path from the source namespace you care about.
A policy object existing in the API does not prove that the installed CNI enforces
it or that every indirect route is covered.

## Describe the path

A NetworkPolicy selects Pods and declares allowed ingress or egress. It is a
network decision, not a user authorization system. DNS, metrics, and dependency
traffic may need their own explicit paths.

## Evidence and limits

Enforcement depends on the installed CNI. Test an allowed request and a denied
request from the relevant namespace; an object existing in the API is not proof
that packets are being filtered.
