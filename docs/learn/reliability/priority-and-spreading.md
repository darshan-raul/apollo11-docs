---
title: "Priority and spreading"
description: "PriorityClasses decide who keeps a place when the cluster is full; topology spread decides how replicas are laid out so one node failure doesn't take a service down."
---

# Priority and spreading

*Stage 4 · Flight Control*

**You will be able to:** explain what a PriorityClass changes when the cluster runs out of room, and read a topology spread constraint and predict where replicas land.

## The problem

[Scheduling](./scheduling) answers "which node *can* take this Pod?". Two questions are left over:

- **When there is no room at all, who goes first?** In a full cluster a new booking Pod sits `Pending` while notification Pods, which matter far less to a passenger, keep their places. Nothing says booking is more important.
- **Where do replicas end up?** Two booking replicas protect you from one Pod crashing. They don't protect you from one *node* failing if the scheduler put both on the same node. By default it is free to do exactly that.

## The idea in plain words

Think of boarding a full flight. Some passengers have priority: if there aren't enough seats, a low-priority passenger is asked to take the next flight so a priority one can board. That's **priority and preemption**.

Separately, a family travelling together might want to be *spread out* across exits, so one blocked exit doesn't trap all of them. That's **topology spread**.

The analogy breaks in one place. Preemption doesn't politely rebook the evicted Pod. It is deleted, and its controller has to create a new one wherever there's room later.

## How it works

### PriorityClass

A **PriorityClass** is a cluster-wide object that gives a name to a number. Pods refer to it by name, and the higher number wins.

```yaml
# stages/stage4/k8s/config/priorityclass.yaml
kind: PriorityClass
metadata: {name: apollo-airlines-app-critical}
value: 1000000              # booking and search
globalDefault: false
---
kind: PriorityClass
metadata: {name: apollo-airlines-app-low}
value: -100000              # notification
globalDefault: false
```

1. A Pod sets `priorityClassName: apollo-airlines-app-critical`. The API server copies the value into `spec.priority`.
2. Pods with a higher priority are tried first in the scheduling queue.
3. If no node fits a high-priority Pod, the scheduler looks for a node where **evicting lower-priority Pods** would make room. It then evicts them; this is **preemption**.
4. The evicted Pods' controllers (ReplicaSets) create replacements, which wait for room like any other Pod.

Apollo's choice: losing a notification for a while is acceptable; losing booking is not. Pods with no class get priority `0`, so notification's negative value puts it below everything else.

### Topology spread

A **topology spread constraint** tells the scheduler to balance matching Pods across groups of nodes. A *topology* is a node label that defines the groups: `kubernetes.io/hostname` (each node is its own group) or `topology.kubernetes.io/zone` (one group per zone).

```yaml
# stages/stage4/k8s/apps/booking/booking-dep.yaml
topologySpreadConstraints:
  - maxSkew: 1                          # group counts may differ by at most 1
    topologyKey: kubernetes.io/hostname # group = one node
    whenUnsatisfiable: ScheduleAnyway   # prefer, don't insist
    labelSelector: {matchLabels: {app: booking}}
```

- **Skew** is the gap between the busiest and the emptiest group. With two workers and two booking Pods, one Pod per node gives skew 0. Both Pods on one node gives skew 2, which breaks `maxSkew: 1`.
- **`whenUnsatisfiable`** decides what happens when the rule can't be met:
  - `DoNotSchedule` is a hard filter. The Pod stays `Pending` rather than break the rule.
  - `ScheduleAnyway` is a scoring preference. The scheduler tries to balance, but places the Pod anyway.
- Spreading is checked **only at scheduling time**. If a node drains and comes back, existing Pods are not moved to rebalance.

| Goal | Tool |
|---|---|
| Booking must win a fight for capacity | PriorityClass |
| Two replicas should sit on different nodes | Topology spread (`hostname`) |
| Spread across zones in the cloud | Topology spread (`zone`), see [Stage 9](../../stage-9) |
| Keep everyone off a node | Taint ([Scheduling](./scheduling)) |
| Limit how many Pods a drain removes at once | [PodDisruptionBudget](./disruption-budgets) |

## Apollo example

- Booking and search: `apollo-airlines-app-critical`, with soft spread across nodes.
- Notification: `apollo-airlines-app-low`.
- Everything else: default priority `0`.
- Stage 7 adds a taint, toleration and node affinity for search on top of this; spreading still applies.

## Try it

```bash
kubectl get priorityclass
kubectl get pods -n apollo-airlines-apps \
  -o custom-columns=NAME:.metadata.name,PRIORITY:.spec.priority,NODE:.spec.nodeName
```

Booking and search show `1000000`, notification `-100000`, and the two booking Pods are normally on different workers.

## Common misconceptions

- **"Priority makes a Pod faster or gives it more CPU."** It only affects queue order and preemption. Resources come from requests and limits.
- **"Preemption moves the evicted Pod somewhere else."** It deletes it. Its controller makes a new one, which may stay `Pending`.
- **"Topology spread guarantees separate nodes."** Only with `DoNotSchedule`, and then a full node leaves replicas `Pending`. Apollo chooses `ScheduleAnyway`, so always check the `NODE` column.
- **"The scheduler rebalances over time."** It doesn't. Placement is decided once.

## Check yourself

<details>
<summary>The cluster is full. A new booking Pod is created. What happens to notification?</summary>

The scheduler can preempt notification Pods (priority -100000) on a node where evicting them frees enough room for booking (1000000). The notification ReplicaSet then creates replacements, which stay `Pending` until room appears.
</details>

<details>
<summary>Why `ScheduleAnyway` instead of `DoNotSchedule` for booking?</summary>

With `DoNotSchedule`, if one worker is full or down, the second replica would stay `Pending`. Two replicas on one node are better than one replica.
</details>

## Where this leads

Priority decides who keeps a place under pressure, and spreading decides where replicas sit. Neither stops *you* from draining a node and taking down both replicas at once. That's the job of [Disruption budgets](./disruption-budgets).
