---
title: From local clusters to cloud
---

# From local clusters to cloud

Kubernetes APIs can look similar locally and in a cloud, while ownership changes radically. A provider may operate the control plane, load balancers, storage backend, and node integration. Portability is therefore about intent and assumptions, not just whether YAML applies.

## In the Lunar Orbit mission

A local kind cluster makes many Kubernetes mechanisms visible in one machine.
Cloud providers may operate the control plane, offer node integrations, provide
load balancers, and implement persistent storage. The Kubernetes API can look
familiar while ownership, failure domains, identity, and cost move outside the
cluster.

## Evidence and limit

For each managed component, ask who configures it, who operates it, where it can
fail, and what evidence shows it is healthy. A manifest applying successfully
does not make its local behaviour portable to every provider.

## The surrounding system changes

A local kind cluster makes ownership visible on one machine. In a cloud, a
provider may operate the control plane, load balancer, storage driver, and node
integration. Kubernetes objects can look familiar while failure domains,
identity, cost, and operational responsibility move outside the cluster.

## Evidence and limits

For every managed component, name its owner, failure domain, contract, and health
evidence. Applying the same YAML is not proof of identical behaviour.
