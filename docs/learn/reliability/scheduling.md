---
title: Scheduling and placement
---

# Scheduling and placement

The scheduler chooses a feasible node by considering requests, constraints, affinity, taints and tolerations, priority, and topology preferences. Pending does not always mean simply unscheduled: inspect conditions and events for the reason. Preemption can evict lower-priority Pods to make room, but it is not a substitute for capacity planning.

## In the Flight Control story

The scheduler selects a feasible node for an unassigned Pod by considering
requests, taints and tolerations, affinity, priority, topology constraints, and
available resources. A Pending Pod is therefore a question to investigate, not
a synonym for “the scheduler has not run.”

## Evidence and limit

Read Pod conditions and events for the actual reason: a resource shortage, an
untolerated taint, an affinity rule, or a waiting claim each asks for a different
fix. Preemption may make room by evicting lower-priority Pods, but it does not
create capacity or make an application healthy.
