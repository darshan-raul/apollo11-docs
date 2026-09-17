---
title: Requests, limits, and pressure
---

# Requests, limits, and pressure

A request influences scheduling and is the denominator for CPU-utilization HPA calculations. A limit constrains runtime use; memory limit breaches can lead to termination. QoS classes summarize request and limit patterns, but BestEffort, Burstable, and Guaranteed are not an absolute eviction ladder. Node pressure decisions also consider use relative to requests and Pod priority.

## In the Flight Control story

A CPU or memory request tells the scheduler what a Pod expects to need. A limit
constrains runtime use; exceeding a memory limit can lead to termination. These
values affect placement and later autoscaling calculations, so they are capacity
and performance choices, not decorative YAML.

## Evidence and limit

QoS classes summarize request and limit patterns, but node-pressure decisions
also consider actual use relative to requests and Pod priority. Do not predict
eviction from QoS class alone; inspect node conditions, events, and the Pod’s
resource story.
