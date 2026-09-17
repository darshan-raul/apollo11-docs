---
title: "Ownership, selection, and replicas"
description: "Start with a missing booking Pod, then learn the objects and relationships that bring it back."
---

# Ownership, selection, and replicas

*Stage 1 · Liftoff*

The booking service has stopped. A passenger only needs to know whether they can
still reserve a flight. The operator needs a more precise story: was the process
restarted inside its existing Pod, was the Pod replaced, who asked for another
copy, and how will the new copy eventually receive traffic?

We will build that story one object at a time. From Ignition, you already know
that a Pod is where containers run and that controllers act on stored desired
state. Liftoff adds the objects that keep a replaceable application running.

## Start with one Pod

A **Pod** is a runtime home for one or more cooperating containers. Apollo’s
booking Pod has an address, starts the booking program, and holds temporary
runtime state. It is not a promise that this particular process will exist
forever.

A **replica** is one intended copy of a workload. Asking for two booking replicas
does not name two permanent machines. It records a target: Apollo should have two
copies of booking available, even if individual Pods are replaced along the way.

~~~mermaid
flowchart LR
  Passenger[Passenger sends a booking request] --> Service[Stable booking Service]
  Service --> PodA[booking Pod]
  PodA -->|Pod disappears| Gap[One replica is missing]
  Gap --> Replacement[Controller creates a new booking Pod]
  Replacement --> Service
~~~

*Diagram WL-01 — the passenger uses a stable service contract while Kubernetes
works to restore the intended number of booking Pods.*

## Add a Deployment

A **Deployment** describes a long-running, replaceable application such as
booking. Its Pod template records the image, labels, configuration, and other
settings for a booking Pod. Its replica count records how many copies are wanted.

The Deployment does not start containers directly. Its controller creates a
**ReplicaSet**. A ReplicaSet has the narrower job of maintaining a chosen number
of matching Pods. When it observes too few, it creates a Pod from its saved
template. When it observes too many, it removes Pods.

~~~mermaid
flowchart TB
  D[Deployment: booking, desired replicas = 2] -->|creates and owns| RS[ReplicaSet: booking template]
  RS -->|creates and owns| P1[Pod: booking copy 1]
  RS -->|creates and owns| P2[Pod: booking copy 2]
  P1 --> K1[booking container runs]
  P2 --> K2[booking container runs]
~~~

*Diagram WL-02 — the Deployment records release intent; the ReplicaSet maintains
the current group of Pods.*

Kubernetes records this responsibility through an **owner reference** on the
child object. The ReplicaSet has an owner reference pointing to the Deployment.
Each Pod has an owner reference pointing to the ReplicaSet. That metadata helps
answer “who created this?” and lets Kubernetes clean up dependent objects when
their owner is removed.

## Ownership is not selection

Now introduce a second relationship: **selection**. Labels are small tags such
as **app: booking**. A selector is a query for objects with matching labels.

The ReplicaSet uses a selector to recognise Pods from its template. In the next
chapter, the booking Service uses its own selector to find candidate Pods for
traffic. The same label can appear in both places, but the relationships answer
different questions:

| Relationship | Question it answers | Example |
| --- | --- | --- |
| Owner reference | Who is responsible for this child object? | The ReplicaSet owns a booking Pod. |
| Selector and label | Which objects belong to this group? | The Service looks for Pods labelled **app: booking**. |

A matching label does not give a Service permission to create or delete a Pod.
An owner reference does not route a passenger request.

## Read a small resource graph

This is a **conceptual example**, not an exact Apollo manifest:

~~~yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: booking
spec:
  replicas: 2
  selector:
    matchLabels:
      app: booking
  template:
    metadata:
      labels:
        app: booking
    spec:
      containers:
        - name: booking
          image: example.invalid/apollo/booking:1.0.0
~~~

Read it from the inside out. The template applies **app: booking** to each Pod.
The Deployment selector says which Pods its ReplicaSet should recognise. The
replica count says two copies are desired. The selector and template label must
agree; Kubernetes keeps the Deployment selector immutable after creation because
changing that relationship could make ownership ambiguous.

## What happens after a failure?

If one of two booking Pods is deleted, the ReplicaSet controller observes only
one matching Pod. It creates a replacement from the saved template. The scheduler
chooses a node; a kubelet starts the container; a later readiness check decides
whether the new Pod should be offered traffic.

The replacement has a new Pod UID and usually a new IP. It receives the same
template and labels, but it does not inherit the old process memory or writable
layer. Mission Data follows the bytes that must survive that event.

## Evidence and limits

Keep three kinds of evidence separate:

- **Acceptance:** the API server accepted the Deployment object.
- **Convergence:** the Deployment and ReplicaSet report the desired number of
  available Pods, and the owner chain looks as expected.
- **Useful behaviour:** a passenger can complete a booking through the Service.

A Deployment maintains a number of Pods. It does not preserve a reservation kept
only in memory, give callers a stable address by itself, or decide whether old
and new application versions are business-compatible. The next Liftoff chapter
introduces the Service relationship.


