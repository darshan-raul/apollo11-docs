---
title: "Reconciliation and Kubernetes components"
description: "Follow a booking Deployment from an accepted API object through controllers, scheduling, kubelet work, and observed status."
---

# Reconciliation and Kubernetes components

*Ignition · Watch the launch sequence*

Suppose Apollo asks for a Deployment of booking. The request is accepted by the
API server, but the API server does not start a container. Several specialised
actors each handle a part of the journey. Learning their small responsibilities
is more useful than treating “Kubernetes” as one invisible actor.

## The actors and their jobs

The **API server** accepts, validates, and stores Kubernetes objects. Controllers
watch objects and compare what they see with the desired state they own. The
**Deployment controller** can create a ReplicaSet; the **ReplicaSet controller**
can create Pods.

A newly created Pod may not yet have a node. The **scheduler** looks for a node
that satisfies the Pod’s requests and constraints, then records that assignment.
The **kubelet** on the chosen node observes Pods assigned there, starts their
containers through the container runtime, runs probes, and reports status.

~~~mermaid
sequenceDiagram
  participant U as Operator
  participant A as API server
  participant D as Deployment controller
  participant R as ReplicaSet controller
  participant S as Scheduler
  participant K as Kubelet
  U->>A: submit booking Deployment
  D->>A: create ReplicaSet
  R->>A: create booking Pod
  S->>A: bind Pod to a node
  K->>K: start booking container
  K->>A: report Pod status
~~~

*Diagram CL-03 — API acceptance, controller work, scheduling, startup, and
status reporting are separate transitions with different evidence.*

## Reconciliation continues after the first launch

The sequence is not only for initial deployment. If a booking Pod is deleted,
the ReplicaSet controller sees fewer Pods than its target and creates a new one.
If a container exits, the kubelet may restart it inside the existing Pod. If a
Pod cannot schedule, the scheduler reports a condition and later retries when
the cluster changes.

Each actor has a narrow view. A controller can see that a replica is missing; it
does not diagnose a database query inside booking. The kubelet can see a
container exit; it does not decide whether a new release should be promoted.
This separation is why useful debugging follows the chain instead of immediately
deleting Pods.

## Work from evidence outward

For a failed launch, begin with the stored object and its conditions. Then inspect
events for scheduling or image pull messages. Then inspect the Pod specification
and container status. Finally, inspect application logs and the passenger-facing
path.

A green Deployment condition is valuable, but it is not the same as a successful
booking. The application can run while an external dependency is unavailable.
This is the evidence ladder in practice: each layer answers a narrower question,
and together they produce a defensible explanation.

## What this does not promise

Reconciliation is asynchronous. Controllers, the scheduler, and kubelets do not
all observe a change at the same instant. A successful API request does not
reserve node capacity forever, preserve process memory, or make dependencies
healthy. The next chapter separates a container restart from a replacement Pod
so you can see which boundaries each recovery action keeps.


