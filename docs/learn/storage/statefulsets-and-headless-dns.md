---
title: StatefulSets and headless DNS
---

# StatefulSets and headless DNS

Use a StatefulSet when stable ordinal identity, stable per-replica storage, or ordered behavior helps the workload. It is not a universal database requirement. A headless Service supports stable Pod DNS identities; a normal Service offers one virtual address over endpoints. The choice says nothing by itself about replication or backups.

## In the Mission Data story

A StatefulSet is useful when a workload benefits from predictable ordinal names,
stable per-replica claims, or ordered operations. A headless Service provides
stable DNS identities for those individual Pods. A normal Service gives callers
one virtual address over a group of endpoints. These choices make identity
explicit; they do not create database replication or a backup plan.

## Evidence and limit

Use a StatefulSet when its identity and ordering semantics solve a real workload
need. A database is not required to use one merely because it stores data.
