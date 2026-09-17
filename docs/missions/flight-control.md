---
title: "Stage 4 — Flight Control: Know When to Wait, Help, and Land"
sidebar_label: "Mission briefing"
---

# Stage 4: Flight Control — Know When to Wait, Help, and Land

A process that has started is not automatically ready for passengers. A Pod that
is ready is not guaranteed to remain useful through every dependency failure.
And a shutdown is not a moment; it is a bounded conversation between the
workload, the kubelet, routing components, and in-flight requests.

Flight Control gives Apollo a vocabulary for those moments. We begin with the
signals the kubelet observes, then move through the resource requests a scheduler
uses, the pressure a node experiences, and the voluntary disruptions a budget
can limit.

## What you will understand

1. [Probes](../learn/reliability/probes)
2. [Termination and draining](../learn/reliability/termination-and-draining)
3. [Requests, limits, and pressure](../learn/reliability/requests-limits-and-pressure)
4. [Scheduling](../learn/reliability/scheduling)
5. [Disruption budgets](../learn/reliability/disruption-budgets)

A startup budget must cover the startup you describe. A preStop hook spends time
inside the termination grace period. QoS classes inform pressure decisions, but
they are not a universal eviction ladder.

## When to take the controls

Use the [Flight Control lab](../stage-4) once you can say which actor reacts to
each probe result and why a local successful rollout is evidence with limits.
Then you can observe readiness, scheduling, and shutdown without overclaiming
availability.


