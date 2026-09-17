---
title: "Pod lifecycle: restart versus replacement"
description: "Learn which identity, network, and data boundaries survive a container restart and which change when a controller replaces a Pod."
---

# Pod lifecycle: restart versus replacement

*Ignition · Learn what actually came back*

When an operator says “booking restarted,” they may be describing two very
different events. The booking container might have exited and been restarted
inside the same Pod. Or the Pod itself might have disappeared and been replaced
by a controller. Both can make a booking process reappear, but they preserve
different boundaries.

Understanding that distinction prevents false conclusions about addresses,
identity, and data.

## A Pod is a shared runtime home

A Pod groups one or more containers that need to share a network identity and
may share mounted storage. Containers in the same Pod can reach each other
through the Pod’s localhost. Separate Pods have separate network identities,
even when the scheduler places them on the same node.

The Pod has a UID, assigned network information, and a lifecycle status. Its
containers have their own restart counts and termination reasons. Those details
are clues about what actually happened.

## Container restart: the Pod remains

If a container exits, the kubelet can restart it according to the Pod’s restart
policy. The Pod is still the same Pod: its UID remains, its network context
remains, and any volumes attached to that Pod remain attached. The new process
does not regain memory from the old process, but the boundary around the Pod did
not change.

## Pod replacement: a new runtime home

If a Pod is deleted or becomes unusable, a controller such as a ReplicaSet can
create another Pod to meet its desired replica count. The replacement gets a new
UID and usually a new IP. It receives the same Pod template, but it is not the
same runtime home.

~~~mermaid
stateDiagram-v2
  [*] --> PodRunning
  PodRunning --> ContainerRestart: container exits; kubelet restarts it
  ContainerRestart --> PodRunning: same Pod UID
  PodRunning --> PodDeleted: Pod is removed or lost
  PodDeleted --> ReplacementPod: controller creates a new Pod
  ReplacementPod --> PodRunning: new Pod UID and usually new IP
~~~

*Diagram CL-04 — both routes can restore a process, but only one retains the
original Pod identity.*

## Investigate the actual event

Compare the Pod UID, creation time, container restart count, events, and owner
references. A rising restart count with the same Pod UID points toward a
container restart. A new UID and creation time point toward replacement. Events
and termination reasons can explain whether an exit, eviction, deletion, or
scheduling problem initiated the change.

Pod phase is only a broad summary. Conditions such as Ready, ContainersReady,
and PodScheduled, along with the reason attached to a failed container, usually
tell a more useful story.

## What survives?

Neither path preserves process memory. A mounted volume may remain through a
container restart and, depending on its type and attachment, may reconnect to a
replacement Pod. A container writable layer is much more fragile. Mission Data
will trace these storage boundaries in detail.

For now, resist the temptation to celebrate whenever a process returns. Ask which
recovery path occurred, what state it kept, and whether a passenger can still
complete a booking after the event.


