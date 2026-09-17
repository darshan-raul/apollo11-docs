---
title: Recovery boundaries
---

# Recovery boundaries

A local-path volume may be tied to a node. Retain or Delete reclaim policy changes what happens when a claim is released; StatefulSet PVC retention is separately configurable. Replication and backups have different failure coverage. Recovery requires an explicit restore procedure and verification, not merely a PVC that still exists.

## In the Mission Data story

A local-path volume may be attached to the node where it was created. Reclaim
policy decides what happens when a claim is released; StatefulSet claim retention
is another explicit policy. Replication can protect a different failure than a
backup, and neither replaces a rehearsed recovery procedure.

## Evidence and limit

A backup becomes a recovery claim only after restoring it into a suitable
environment and verifying the booking workflow and data. A surviving PVC is not
a substitute for that exercise.
