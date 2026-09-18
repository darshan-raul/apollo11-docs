---
title: "Stage 7 — Orbital Maneuvering: Respond to Demand"
sidebar_label: "Mission briefing"
---

# Stage 7: Orbital Maneuvering — Respond to Demand

More passengers are searching for flights. Before changing replicas, adding a
cache, or tuning resources, we need a baseline: what workload ran, what changed,
which result improved, and what else became worse? Orbital Maneuvering treats
performance as an investigation rather than a collection of magic knobs.

Caching changes the work a request performs. HPA changes the desired replica
count from measured demand. VPA recommends or changes resources. Node capacity
and scheduling decide whether new Pods can actually run. These mechanisms often
appear together, but they solve different parts of the problem.

## What you will understand

1. [Measurement baseline](../learn/scaling/measurement-baseline)
2. [Cache-aside](../learn/scaling/cache-aside)
3. [Horizontal Pod Autoscaling](../learn/scaling/hpa)
4. [VPA and capacity](../learn/scaling/vpa-and-capacity)

As you read, ask what each mechanism measures, which value it changes, and what
must already exist for that change to help. The chapters introduce the precise
autoscaling calculations and configuration only after the performance question
is clear.

## When to take the controls

Open the [Orbital Maneuvering lab](../stage-7) once you can state the baseline
and predict whether a cache, extra replicas, or a resource recommendation is
the relevant response. Then use the local experiment to collect evidence rather
than just watch numbers move.

