---
title: "Why orchestration?"
description: "Start with the question a single machine cannot answer: who keeps Apollo running when its pieces move or fail?"
---

# Why orchestration?

*Ignition · Ask the cluster to fly*

Launchpad can run Apollo Airlines on one machine. A person starts containers,
checks logs, and restarts a process when it fails. That arrangement is useful,
but it puts the person at the centre of every recovery. Now imagine booking is
needed on several machines, one machine goes away, and a passenger request still
arrives. We need a durable description of what should be running and a group of
actors that continuously work toward it.

That is the problem Kubernetes orchestration addresses.

## Desired state is a promise we can inspect

Instead of telling a machine “start booking now,” you describe a desired result:
Apollo should have a chosen number of booking copies with a particular container
template. Kubernetes stores that request in its API. Controllers observe the
stored request and the current cluster, then take small actions to reduce the
difference between them.

This model is called **reconciliation**. It is a loop, not a single deployment
moment. A controller may create a Pod, later notice that it disappeared, and
create another one because the desired count still says it should exist.

~~~mermaid
flowchart LR
  Intent[Desired state: two booking copies] --> API[Stored Kubernetes object]
  API --> Controller[Controller observes the request]
  Actual[Observed cluster state: one booking Pod] --> Controller
  Controller --> Action[Create a replacement Pod]
  Action --> Actual
~~~

*Diagram CL-01 — reconciliation compares a recorded request with observed state
and takes another small step toward the request.*

## What orchestration changes

A controller can create a replacement Pod after the old one is deleted. A
scheduler can choose a suitable node. A kubelet can start and monitor containers
on its node. Those capabilities give the cluster a way to restore processes
without an operator typing the same restart command each time.

They do not make every application concern disappear. Kubernetes can recreate a
booking Pod but cannot recreate a reservation stored only in its memory. It can
send traffic toward a ready Pod but cannot guarantee every downstream service
will work. It can start a new image but cannot undo an external side effect from
an old one. The rest of Apollo’s journey names these boundaries instead of hiding
them behind the word “self-healing.”

## A useful way to read every mechanism

When you meet a new Kubernetes object, ask five questions:

1. What application problem does this object help describe?
2. What part of the object records the desired state?
3. Which running actor observes that object or condition?
4. What action can that actor take?
5. What evidence says the result is useful, and what does the mechanism not
   guarantee?

For the missing booking Pod, the desired replica count is the intent; a
controller observes the gap; it creates a replacement; and a passenger booking
is stronger evidence than merely seeing a new Pod name.

## What comes next

The next chapter introduces the API objects that hold these requests. Then we
will meet the components that turn an accepted object into a running Pod. Only
after those concepts are established does the Ignition lab ask you to observe
them in a local cluster.

## The problem Apollo has outgrown

Launchpad can restart a container, but a person must notice the failure and know
which machine should receive the replacement. With several machines and several
copies of booking, that manual list becomes a second system to maintain.

Kubernetes lets Apollo describe the result it wants: a chosen number of booking
copies, a Pod template for those copies, and relationships that let other
objects
find them. The API stores that intent. Controllers repeatedly compare it with
what exists and take actions that reduce the gap.

## What orchestration can and cannot repair

A ReplicaSet can create a replacement Pod. A scheduler can find a feasible node.
A kubelet can start a container and report its state. None of them can recreate
bytes that lived only in process memory, decide whether a database migration was
safe, or prove a passenger’s whole booking succeeded.

Use orchestration as a way to make recovery repeatable and inspectable. It gives
the airline participants that keep working toward a declared state; it does not
turn every application guarantee into a Kubernetes guarantee.

