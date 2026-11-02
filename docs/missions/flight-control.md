---
title: "Stage 4 — Flight Control: Know When to Wait, Help, and Land"
sidebar_label: "Mission briefing"
---

# Stage 4 · Flight Control: reliability

**Problem:** start, stop and move Pods without dropping a passenger's request.

## Chapters

Builds on Stage 1's [Services and readiness](../learn/workloads/services-and-readiness) and Ignition's [ReplicaSets](../learn/cluster/replicasets).

1. [Probes](../learn/reliability/probes): startup, liveness and readiness; thresholds; what each must not check.
2. [Termination and draining](../learn/reliability/termination-and-draining): the parallel shutdown paths, the routing race, one grace-period budget, PID 1.
3. [Requests, limits and pressure](../learn/reliability/requests-limits-and-pressure): scheduling on requests, throttling and OOM kills, QoS, node-pressure eviction.
4. [Scheduling and placement](../learn/reliability/scheduling): filter, score, bind; reading `Pending`; affinity, taints and the built-in ones.
5. [Priority and spreading](../learn/reliability/priority-and-spreading): preemption, skew, and the traps in counting it.
6. [Disruption budgets](../learn/reliability/disruption-budgets): the Eviction API, `disruptionsAllowed`, and drains that never finish.

## Ready for the walkthrough when you can answer

- Readiness fails vs liveness fails: what does the kubelet do in each case?
- Why can a Pod receive a request after its shutdown has started, and what does `preStop: sleep 5` buy?
- Grace period 30 s, `preStop` 5 s: how long may the app take to drain?
- Requests equal limits: which QoS class, and where does it matter?
- Why is a Pod on a powered-off node replaced only after several minutes?
- A PDB says `minAvailable: 1` with 1 replica. What does an eviction return, and what happens to a drain?

## Walkthrough

- [Stage 4 walkthrough](../stage-4)
