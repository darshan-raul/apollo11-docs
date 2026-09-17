---
title: Ephemeral state
---

# Ephemeral state

A controller can replace a failed Pod, not recreate the unique bytes that lived only in its memory or writable layer. Before deleting a Pod, name the state boundary: container, Pod, volume, claim, node, or external system. This simple habit prevents “self-healing” from being mistaken for data recovery.

## In the Liftoff mission

A replacement booking Pod is a fresh runtime home. It may have the same image
and labels as its predecessor, but its memory and container-writable files are
new. This is why an application can appear healthy after replacement while a
piece of state quietly disappears.

## Evidence and limit

Before calling recovery successful, name the boundary that retained the required
data: process, container, Pod, volume, claim, node, or external system. Mission
Data expands this into durable storage and recovery claims.
