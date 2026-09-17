---
title: Pod networks and CNI
---

# Pod networks and CNI

Each Pod receives its own network identity. A CNI implementation configures connectivity; Kubernetes defines the network model but does not itself forward every packet. Container localhost is shared only by containers in the same Pod. NetworkPolicy enforcement also depends on the CNI implementation.

## In the Guidance mission

A Pod has its own network identity, so the booking Pod and flight Pod are
separate network locations even when they share a node. Containers in one Pod
can share that Pod network, which is why a sidecar may use localhost to reach its
main container. A CNI implementation configures the connectivity that makes
Pod-to-Pod communication possible.

## Evidence and limit

A Pod IP and a successful connection show a specific path works at that moment.
They do not give callers a durable address, describe DNS search behaviour, or
prove that NetworkPolicy is enforced; those need Services, DNS, and a capable CNI.
