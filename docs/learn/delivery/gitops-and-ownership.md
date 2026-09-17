---
title: GitOps and ownership
---

# GitOps and ownership

A GitOps controller compares a declared source with live objects, renders as configured, computes a diff, and performs sync actions. In Argo CD, sync and health are distinct statuses. Ownership must be explicit: avoid having two controllers continuously reconcile the same fields without a defined boundary.

## In the Payload Integration mission

A GitOps controller repeatedly compares a declared source with live cluster
objects. It renders as configured, identifies differences, and can synchronize
them. In Argo CD, sync tells you about that desired/live action while health
reports a separate assessment of runtime resources. Give one controller a clear
ownership boundary for a field or object.

## Evidence and limit

Inspect the Application source, generated manifests, diff, sync status, and
health status separately. A synced application can still be unhealthy; a healthy
workload can still differ from a repository that has not yet been reconciled.

## Who is allowed to keep changing the object?

A GitOps controller repeatedly compares a declared source with live objects. It
can render, calculate a diff, synchronize desired fields, and assess health.
This creates a second important relationship: ownership of reconciliation. If a
manual command, Helm, and Argo all keep writing the same fields, Apollo can
oscillate between intentions.

In Argo CD, **sync** describes comparison and application of desired state;
**health** describes the observed condition of resources. They are related and
not interchangeable.

## Evidence and limits

Inspect the Application source, rendered manifests, diff, sync result, health
conditions, and the controller responsible for each object. A synced workload
can still be unhealthy, and a healthy workload can still differ from a source
that has not yet reconciled.
