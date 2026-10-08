---
title: "Why orchestration?"
description: "Why desired state plus controllers replace a person restarting containers."
---

# Why orchestration?

*Ignition*

**You will be able to:** explain what orchestration solves, describe reconciliation in your own words, and apply five questions to any Kubernetes object.

## The problem

In Launchpad, you were the control system. You started the containers, you noticed when one died, and you restarted it. That works for ten containers on one laptop while you are watching.

Now imagine booking must run on several machines, one machine disappears at 3 a.m., and passengers keep arriving. Someone (or something) has to notice the loss, decide what should exist instead, and make it so, without you typing the same command each time. That "something" needs two things: a **durable record of what should be running**, and **programs that keep working to make reality match the record**.

## The idea in plain words

A thermostat is the best everyday picture. You do not tell a heater "switch on now". You set a target temperature (**desired state**). The thermostat keeps measuring the room (**observed state**) and turns the heater on or off to close any gap. It never "finishes": it keeps checking.

Kubernetes works the same way:

- You describe a result in the cluster's database through its API: "Apollo should have 2 booking copies, built from this template."
- Programs called **controllers** watch that record and the real cluster. When they differ, they take a small step to close the gap, then look again.

This loop is called **reconciliation**. The important word is *loop*: it is not a single deployment moment. If a booking copy vanishes tomorrow, the same loop notices (1 < 2) and creates another, because the record still says 2.

The thermostat analogy breaks in one way: Kubernetes has many specialised "thermostats" (one for replica counts, one for choosing nodes, one for starting containers), each watching a narrow slice.

## How it works

```mermaid
flowchart LR
  Intent[Desired: 2 booking] --> API[(Stored API object)]
  API --> C[Controller]
  Actual[Observed: 1 booking Pod] --> C
  C --> Action[Create a Pod]
  Action --> Actual
```

1. You submit the desired state; the API stores it.
2. A controller reads desired and observed state.
3. If they differ, it acts (create or delete something).
4. The new observed state feeds back in, and it checks again.

## What orchestration does not do

It restores *processes*, not everything those processes knew.

| Kubernetes can | Kubernetes cannot |
|---|---|
| Recreate a missing booking Pod | Recreate a reservation held only in that Pod's memory |
| Send traffic to ready Pods | Guarantee downstream services work |
| Start a new image version | Undo side effects of the old version |

"Self-healing" is shorthand for the left column only. The rest of the course names the boundaries instead of hiding them.

## Five questions for every object

Use these on every new Kubernetes object you meet:

1. What application problem does it describe?
2. Which field records the desired state?
3. Which running actor observes it?
4. What action can that actor take?
5. What evidence shows the result is useful, and what does the mechanism *not* guarantee?

For a missing booking Pod: the desired replica count is the intent; the ReplicaSet controller observes the gap; it creates a Pod; and a successful booking, not just a new Pod name, is the real evidence.

## Try it

```bash
kubectl get deploy booking -n apollo-airlines -o jsonpath='desired={.spec.replicas} ready={.status.readyReplicas}{"\n"}'
```

- Desired (`spec`) and observed (`status`) live side by side on one object. (Needs Stage 1; read it now and return.)

## Common misconceptions

- **"`kubectl apply` starts my containers."** It records desired state. Other components act on it.
- **"Self-healing keeps my data safe."** It only recreates processes.
- **"Reconciliation happens once at deploy time."** It runs continuously.

## Check yourself

<details>
<summary>Why is "self-healing" an incomplete description?</summary>

It restores processes to match a recorded intent. It cannot restore state held only in a lost Pod or repair a broken dependency.
</details>

## Where this leads

Desired state needs somewhere to live and a shape. Next: the objects the API stores and how to read them.
