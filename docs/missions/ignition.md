---
title: "Ignition — Ask the Cluster to Fly"
sidebar_label: "Mission briefing"
---

# Ignition: your first cluster

**Problem:** a Pod is requested. Which component does each step, and how do you tell where it stopped?

## Chapters

1. [Why orchestration?](../learn/cluster/why-orchestration)
2. [Objects and the API](../learn/cluster/objects-and-api)
3. [Reconciliation and components](../learn/cluster/reconciliation-and-components)
4. [Pod lifecycle](../learn/cluster/pod-lifecycle)

## Ready for the lab when you can answer

- Which component picks the node? Which starts the container?
- `kubectl apply` returned. What has actually happened so far?
- A Pod is `Pending`. Which component's events do you look for?
- A Pod is `ImagePullBackOff`. Which component is reporting?

## Lab

- [Build Ignition](../ignition): creates the 3-node `kind` cluster and runs a bare Pod.
