---
title: Volume lifetimes
---

# Volume lifetimes

Name the failure boundary before calling storage persistent. EmptyDir follows the Pod and disappears when the Pod is removed. A container writable layer follows the container. A persistent volume claim can outlive Pods, subject to storage, retention, and reclaim configuration. Neither name nor object type promises recovery from node, zone, or cluster loss.

## In the Mission Data story

A reservation stored only in booking’s memory vanishes when that process ends.
A container writable layer follows the container. An emptyDir follows the Pod.
A separately provisioned volume can have a longer lifetime, but “persistent”
always needs a named failure boundary: Pod replacement, node loss, zone loss, or
cluster loss.

## Evidence and limit

Before a lab deletion, say which object should survive and which should not.
Seeing a claim after a Pod replacement proves that one boundary was crossed; it
does not prove the storage backend can survive every failure you care about.
