---
title: "Objects, the API, and desired state"
description: "Learn to read Kubernetes YAML as a stored request with identity, desired state, and observed status."
---

# Objects, the API, and desired state

*Ignition · Write down what Apollo should look like*

A Kubernetes manifest can look like a configuration file you run once. That is
not how the cluster treats it. The manifest describes an **object** for the API
server to store. Controllers, schedulers, and kubelets later observe that stored
object and act on the parts they are responsible for.

This distinction changes how you read YAML. You are not reading a sequence of
instructions. You are reading an agreement about identity, desired state, and
the status that other actors report later.

## Every object has an identity

An object has a kind, a name, and usually a namespace. The name lets humans and
other objects refer to it within its namespace. Kubernetes also assigns a UID, a
unique identity that distinguishes a newly created booking Pod from an older Pod
with the same name.

Metadata can include labels, annotations, and owner references. Labels are short
tags used for grouping and selection. An annotation carries extra information
that is not normally used as a selector. An owner reference records a lifecycle
relationship between objects. You will use all three, but they answer different
questions.

## Spec asks; status reports

The **spec** is where a user or another controller records what is wanted. A
Deployment spec can request a number of booking replicas and include a Pod
template. The **status** is where controllers report what they have observed:
how many replicas are available, which generation was seen, or which condition
is blocking progress.

~~~mermaid
flowchart TB
  Manifest[Manifest describes an object] --> API[API server stores object]
  API --> Object[metadata + spec + status]
  Controller[Controller] -->|watches spec and conditions| Object
  Controller -->|writes observations| Object
  User[Operator] -->|reads status and events| Object
~~~

*Diagram CL-02 — the object is stored configuration. The controller is the
running participant that observes it and takes action.*

This leads to a useful distinction. If the API server accepts a Deployment, the
request is accepted. It does not yet say that a controller created Pods, a
scheduler chose nodes, a kubelet started containers, or a passenger completed a
booking.

## Read a request in three passes

When you open an Apollo manifest, first ask **what is this object called and
where does it live?** Then ask **what result does its spec request?** Finally,
ask **which actor should report meaningful status or events?**

For a booking Deployment, that might mean:

- identity: a Deployment named booking in the application namespace;
- desired state: a Pod template and replica count;
- observed state: Deployment conditions and available replicas from its
  controller.

This approach works for Services, Jobs, PersistentVolumeClaims, Gateway routes,
and autoscalers too. The kinds change, but the stored-request model remains.

## Evidence and limits

A manifest is evidence of intent. The API response is evidence of acceptance.
Status and conditions are evidence that a controller has observed or progressed
the request. A request through the running application is evidence of useful
behaviour.

No field in a manifest causes traffic or starts a process by its own power. The
next chapter introduces the actors that interpret these objects and pass work
from API acceptance toward a running Pod.


