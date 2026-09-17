---
title: Topology, scaling, and upgrades
---

# Topology, scaling, and upgrades

Zonal storage and node topology constrain where Pods can run. Pod autoscaling and node autoscaling respond to different shortages. Upgrades are coordinated changes across control plane, nodes, workloads, and add-ons; test compatibility and disruption behavior rather than assuming an API-compatible cluster is operationally identical.

## In the Lunar Orbit mission

Storage zones and node topology can restrict where a stateful Pod may run. Pod
autoscaling responds to workload demand; node autoscaling responds to a capacity
shortage under its own rules. Upgrades coordinate control planes, nodes,
workloads, and add-ons, so an API-compatible target is not automatically an
operationally identical one.

## Evidence and limit

Test topology and disruption behaviour with the workload and storage class you
intend to use. Treat upgrade success as a sequence of compatibility and recovery
checks, not simply a provider control-plane version change.

## Different shortages, different responses

Zonal storage and node topology can constrain where a stateful Pod may run. Pod
autoscaling responds to demand; node autoscaling responds to a capacity
shortage. An upgrade coordinates control plane, nodes, workloads, and add-ons.

## Evidence and limits

Test topology and disruption behaviour with the storage class and workload you
will operate. An API-compatible version is not automatically operationally
identical.
