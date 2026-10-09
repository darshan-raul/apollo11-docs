---
title: "Ignition — Ask the Cluster to Fly"
sidebar_label: "Mission briefing"
---

# Ignition: your first cluster

**Problem:** a Pod is requested. Which component does each step, and how do you tell where it stopped?

## Chapters

1. [Why Kubernetes?](../learn/cluster/why-orchestration): what one host cannot do; Kubernetes compared with Compose.
2. [Architecture and the basic flow](../learn/cluster/architecture): control plane, nodes, and a Pod's journey.
3. [Pods](../learn/cluster/pods): how a Pod differs from a container; restarts in place.
4. [The controller loop](../learn/cluster/controller-loop): desired vs observed state, kept true.
5. [ReplicaSets](../learn/cluster/replicasets): keeping N Pods alive; labels, selectors, ownership.
6. [Deployments](../learn/cluster/deployments): rolling a new version out, and back.
7. [Objects and the API server](../learn/cluster/objects-and-api): what happens to a request before it is stored.

## Ready for the walkthrough when you can answer

- Which component picks the node? Which starts the container?
- A container crashes; a Pod is deleted. Which component brings each back, and what changes?
- `kubectl apply` returned. What has actually happened so far?
- A Pod is `Pending`. Which component's events do you look for?
- A Pod is `ImagePullBackOff`. Which component is reporting?

## Walkthrough

- [Ignition walkthrough](../ignition): creates the 3-node `kind` cluster and runs a bare Pod.
