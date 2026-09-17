---
title: "Ignition — Ask the Cluster to Fly"
sidebar_label: "Mission briefing"
---

# Ignition: Ask the Cluster to Fly

Launchpad taught us how Apollo’s programs run on one machine. Now imagine the
booking service disappears while passengers are still arriving. A person can
restart it, but a multi-machine system needs a durable instruction that says what
should exist, plus participants that keep looking for the gap.

Ignition introduces Kubernetes through that problem. You are not memorising a
catalogue of components. You are learning how a declaration travels from an API
object to a running process, and how to tell which part of that journey has
stopped.

## What you will understand

Kubernetes stores desired state as objects. Controllers react to object changes,
the scheduler chooses a node for a Pod, and a kubelet on that node starts and
monitors containers. These actors cooperate, but they do different jobs.

1. [Why orchestration?](../learn/cluster/why-orchestration)
2. [Objects and the API](../learn/cluster/objects-and-api)
3. [Reconciliation and components](../learn/cluster/reconciliation-and-components)
4. [Pod lifecycle](../learn/cluster/pod-lifecycle)

Keep one distinction close: an API server accepting a Deployment is not evidence
that a booking Pod is scheduled, started, ready, or useful to a passenger.

## When to take the controls

Take the [Ignition lab](../ignition) once you can narrate the path from a
manifest to the kubelet and distinguish a container restart from a controller
creating a replacement Pod. The evidence ladder in the lab gives those ideas a
real cluster to work against.


