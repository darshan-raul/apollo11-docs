---
title: "Networks and clients"
description: "Learn to locate the client before choosing an address, port, or meaning for localhost."
---

# Networks and clients

*Launchpad · Ask where the request starts*

A passenger opens Apollo Airlines in a browser. The browser asks the frontend
for a page. Later, the booking service asks flight whether a seat is available.
Both are HTTP requests, but they begin in different places. That difference is
the key to understanding addresses, ports, and the most misleading word in early
container networking: **localhost**.

Before choosing an address, name the client. The browser is a client on the
passenger’s machine. Booking is a client inside its own container. Flight is a
server process inside another container. A network address only makes sense from
one of those locations.

## What localhost actually means

Localhost means “this network environment.” It does not mean “my laptop” in
every situation, and it never means “another service I hope is nearby.”

A browser using localhost reaches a process visible from the browser’s machine.
A booking container using localhost reaches a process inside booking’s own
network environment. If flight runs in another container, booking needs a route
or service name that reaches that other container.

A port is similarly local. Flight may listen on port 8081 inside its container.
That tells us where the flight process accepts connections in its own network
environment. Publishing a port can create a separate path from the host machine
to that container, but it does not change what port means inside other containers.

~~~mermaid
flowchart TB
  Browser[Passenger browser] -->|host-visible address| Frontend[frontend container]
  Booking[booking container] -->|service name and port| Flight[flight container]
  Booking -->|localhost| Own[only booking's own network environment]
  Browser -->|localhost| Laptop[passenger's machine]
~~~

*Diagram CT-03 — the same word, localhost, points to a different place for each
client.*

## Give cooperating services stable names

Container platforms make application names more useful than changing IP addresses.
In Compose, services on the same application network can find one another by
service name. Booking can ask for flight instead of storing the current IP of a
particular flight container.

Kubernetes will build a similar promise with Services and DNS. The details are
different, so do not carry every Compose rule forward unchanged. The durable
principle is that callers should use a stable contract while containers and Pods
can be replaced behind it.

## Trace one Apollo request

When a passenger submits a booking, the browser first contacts an externally
reachable frontend or edge address. The frontend or edge component then contacts
a backend using the application network. When booking contacts flight, the
source is booking, not the browser. If that call fails, start the investigation
at booking’s network view: its configured name, DNS result, reachable port, and
the flight process that should be listening.

This prevents a common dead end: testing a URL from a laptop and assuming the
same address must work from inside a container.

## Evidence and limits

A successful connection from one client is evidence for that client’s path. It
does not prove a different client has the same DNS search path, port mapping, or
network policy. Record where the test ran and which name, port, and protocol it
used.

Names and routes help a process find another process. They do not make the
destination ready for useful work. The next chapter follows what happens when a
dependency exists but cannot yet help complete a passenger booking.


