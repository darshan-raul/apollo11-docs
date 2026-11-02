---
title: "Stage 7 — Orbital Maneuvering: Respond to Demand"
sidebar_label: "Mission briefing"
---

# Stage 7 · Orbital Maneuvering: scaling

**Problem:** more searches arrive. Pick the change that helps and prove it.

## Chapters

Builds on Stage 4's [requests and limits](../learn/reliability/requests-limits-and-pressure) (the HPA's denominator) and Stage 6's [metrics](../learn/observability/signals-and-metrics) (the evidence for every change).

1. [Measurement before optimization](../learn/scaling/measurement-baseline): one variable at a time, open load, dropped iterations and Little's law, honest reporting.
2. [Cache-aside](../learn/scaling/cache-aside): every branch of search's cache, TTLs, key design, stampedes, the cache as hidden capacity.
3. [Horizontal Pod Autoscaling](../learn/scaling/hpa): metrics-server, the formula, the limit ceiling, behavior policies, who owns `spec.replicas`.
4. [VPA and capacity](../learn/scaling/vpa-and-capacity): how recommendations are computed, update modes, the HPA/VPA loop, node capacity.

## Ready for the walkthrough when you can answer

- What must stay fixed while you compare cache on and cache off?
- What do dropped iterations in an arrival-rate test usually mean?
- Cache vs more replicas: which reduces work per request, and what happens to flight when Redis fails?
- HPA: which metric, divided by what, within which bounds? Why does `limits == requests` slow it down?
- Why is the VPA in recommendation mode next to a CPU-based HPA?

## Walkthrough

- [Stage 7 walkthrough](../stage-7)
