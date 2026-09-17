---
title: Termination and draining
---

# Termination and draining

Termination is bounded coordination. On deletion, endpoints may be withdrawn and proxies update asynchronously; the kubelet runs preStop and sends termination signals inside the same termination grace period. preStop does not add a second grace window. Applications should stop accepting new work, finish or hand off bounded work, and exit before the deadline.

## In the Flight Control story

When a booking Pod is asked to terminate, endpoint withdrawal, proxy updates,
the preStop hook, process signals, and in-flight requests do not complete in one
instant. The kubelet runs preStop inside the same termination grace period before
it sends the termination signal. Applications should stop accepting new work and
finish or hand off bounded work before the deadline.

## Evidence and limit

Observe termination timestamps, endpoint changes, application logs, and a bounded
request test. Endpoint withdrawal and proxy updates are asynchronous, so a
graceful shutdown sequence reduces risk; it does not promise every request will
avoid every race.
