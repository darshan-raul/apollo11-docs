---
title: "Why orchestration?"
description: "Why desired state plus controllers replace a person restarting containers."
---

# Why orchestration?

*Ignition*

**You will be able to:** explain reconciliation and the five questions to ask about any Kubernetes object.

## The problem

- Launchpad puts a **person** at the centre of recovery: start, check logs, restart.
- Across several machines, something must hold a durable description of what should run and **keep working toward it**.

## Key points

- **Desired state** is stored in the Kubernetes API ("2 booking copies, this template").
- **Controllers** compare desired state with observed state and take small corrective steps.
- **Reconciliation is a loop**, not a deployment moment: a deleted Pod is recreated because the desired count still says 2.
- Different actors do different jobs: controller (counts), scheduler (node choice), kubelet (run containers).

```mermaid
flowchart LR
  Intent[Desired: 2 booking] --> API[(API object)]
  API --> C[Controller]
  Actual[Observed: 1 booking Pod] --> C
  C --> Action[Create a Pod]
  Action --> Actual
```

## What it does not do

| Kubernetes can | Kubernetes cannot |
|---|---|
| Recreate a booking Pod | Recreate a reservation held only in memory |
| Route traffic to ready Pods | Guarantee downstream services work |
| Start a new image | Undo side effects of the old one |

## Five questions for any object

1. What application problem does it describe?
2. Which field records the desired state?
3. Which actor observes it?
4. What action can that actor take?
5. What evidence shows the result is useful, and what does the mechanism **not** guarantee?

## Apollo example

- Missing booking Pod: intent = `replicas: 2`; observer = ReplicaSet controller; action = create Pod; real evidence = a successful booking, not just a new Pod name.

## Try it

```bash
kubectl get deploy booking -n apollo-airlines -o jsonpath='desired={.spec.replicas} ready={.status.readyReplicas}{"\n"}'
```

- Desired (`spec`) and observed (`status`) sit side by side on the same object. (Needs Stage 1.)

## Check yourself

<details>
<summary>Why is "self-healing" an incomplete description?</summary>

It restores processes to match a recorded intent. It cannot restore state held only in a lost Pod or repair a broken dependency.
</details>
