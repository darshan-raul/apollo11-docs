---
title: "State and dependencies"
description: "Learn why a listening booking process may still be unable to help a passenger, and which state survives a replacement."
---

# State and dependencies

*Launchpad · Ask whether the airline can actually serve a passenger*

The booking container has started and its HTTP port is open. That is encouraging,
but it is not yet the same as a working booking service. A passenger’s request
can still fail if booking cannot reach identity, flight, or its database. The
process is alive; the airline may not be ready.

At the same time, the request creates or reads state. Some state belongs only to
the running process. Some may be written into the container’s temporary writable
layer. A reservation that must be found after a replacement needs a different
home. These are separate problems that happen to meet in one booking request.

## Name the state boundary

Process memory disappears when the process ends. A container’s writable layer is
tied closely to that container; replacing the container normally discards it.
Stopping and starting the same container can preserve that layer on one host, but
that is a much weaker boundary than a passenger reservation requires.

A mounted volume can outlive a container, depending on the type of volume and
its configuration. Mission Data will examine claims, storage backends, node
failures, and backups. For now, use this simple question before you call data
safe: “What event can happen without these bytes disappearing?”

## Alive and ready answer different questions

A health check can ask whether a process is alive enough to continue running. A
readiness check asks whether the service should receive a new request. They are
not competing versions of the same check.

Booking can be alive while its database is still starting. It may be sensible to
keep the process running while withholding new passenger traffic until the
dependency is usable. Conversely, a check that waits forever for every distant
dependency can make a temporary external incident stop all local recovery. The
right check is a bounded statement about whether this service can accept the next
unit of work.

~~~mermaid
flowchart LR
  Process[booking process is running] --> Alive{Can it continue?}
  Process --> Dependencies{Can a booking use required dependencies?}
  Dependencies -->|yes| Ready[Accept new booking traffic]
  Dependencies -->|not yet| Wait[Remain alive; withhold new traffic]
  Flight[flight service] --> Dependencies
  DB[(booking database)] --> Dependencies
  Identity[identity service] --> Dependencies
~~~

*Diagram CT-04 — liveness concerns the process; readiness concerns the useful
request path.*

## Follow the passenger’s request

A booking request may ask identity to validate a passenger, flight to reserve a
seat, and the booking database to store the reservation. A successful port check
only tells you that one first step—reaching booking—worked. It does not tell you
that those later calls succeeded.

That distinction becomes operationally useful when you investigate a failure.
A process log may say the database connection timed out. An endpoint check may
say the process should not receive traffic. A successful booking is the evidence
that the complete path worked for that request.

## Evidence and limits

State the boundary you tested: process, container, mounted volume, claim, node,
or external system. State the dependency path you tested: process port, local
health endpoint, or actual booking. These observations support different claims.

Readiness reduces the chance that traffic is sent to a service that has reported
itself unable to serve. It does not guarantee every later dependency call or
preserve data through every failure. Kubernetes will use readiness as one input
to routing; Mission Data will make the storage boundary explicit.


