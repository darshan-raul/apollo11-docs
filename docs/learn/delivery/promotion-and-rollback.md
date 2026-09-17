---
title: Promotion and rollback
---

# Promotion and rollback

Promotion changes which reviewed artifact and configuration a target environment declares. A rollback restores an earlier desired object revision, but does not reverse unrelated side effects or database writes. Confirm acceptance, convergence, and useful behavior separately after either operation.

## In the Payload Integration mission

Promotion chooses which reviewed image and configuration a later environment
should desire. Rollback changes desired workload state toward a known earlier
revision. Both are deliberate changes to the resource graph, and both deserve
the same evidence ladder as a forward release.

## Evidence and limit

Confirm which revision rendered, whether Pods converged, and whether the booking
path works. Neither operation reverses messages sent to notification, database
writes, or changes made by a different system outside that resource graph.

## A release is more than a Pod template

Promotion selects a reviewed artifact and configuration for another environment.
Rollback selects an earlier desired graph. Both operations change what Apollo
asks the cluster to run, and both need the same evidence: which revision rendered,
which Pods converged, and whether a booking still behaves correctly.

## Evidence and limits

A rollback can restore an earlier Deployment template or Helm revision. It cannot
unsend a notification, reverse a database write, refund an external payment, or
repair a schema changed by a migration. Treat those side effects as separate
recovery work.
