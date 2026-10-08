---
title: "Stage 4 — Flight Control: Know When to Wait, Help, and Land"
sidebar_label: "Mission briefing"
---

# Stage 4 · Flight Control: reliability

**Problem:** start, stop and move Pods without dropping a passenger's request.

## Chapters

1. [Probes](../learn/reliability/probes): startup, liveness, readiness.
2. [Termination and draining](../learn/reliability/termination-and-draining)
3. [Requests, limits and pressure](../learn/reliability/requests-limits-and-pressure)
4. [Scheduling](../learn/reliability/scheduling)
5. [Priority and spreading](../learn/reliability/priority-and-spreading)
6. [Disruption budgets](../learn/reliability/disruption-budgets)

## Ready for the walkthrough when you can answer

- Readiness fails vs liveness fails: what does the kubelet do in each case?
- Why does `preStop: sleep 5` prevent dropped requests during a rollout?
- Requests equal limits: which QoS class? Why does it matter at node pressure?
- A PDB says `minAvailable: 1` with 1 replica. What does an eviction return?

## Walkthrough

- [Stage 4 walkthrough](../stage-4)
