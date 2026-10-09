---
title: From local clusters to cloud
description: "Which system fulfils each Kubernetes request locally versus in a cloud, and what 'portable' means."
---

# From local clusters to cloud

*Lunar Orbit · Planned*

**You will be able to:** for any Kubernetes object, name who fulfils it locally and in the cloud, and grade how portable it really is.

Everything so far ran in kind: Kubernetes nodes that are Docker containers on one laptop. That is ideal for learning because every part is visible and free, but it hides things a real airline must face: separate machines, zones that fail independently, load balancers that cost money, storage that lives outside the node. Moving to the cloud, the YAML may apply unchanged and yet mean something very different.

## Same object, different fulfilment

A Kubernetes object is a **purchase order**: the form is the same everywhere, but *who fulfils it* differs. "Deliver one load balancer" is fulfilled locally by MetalLB handing out an IP from a list, and in the cloud by a provider API creating a billable managed load balancer. The form (the API) stays stable; the fulfiller, its failure modes, security boundary and cost all change.

| Request | Local (kind) | Possible cloud implementation |
|---|---|---|
| A node | A kind container | A virtual machine joined to the cluster |
| A volume | A node-local directory (`local-path`) | A zonal block volume through a CSI driver |
| `type: LoadBalancer` | MetalLB gives an IP from a pool | A provider load balancer and a billable public IP |
| An operator logging in | A local kubeconfig | Provider IAM combined with Kubernetes identity |

```mermaid
flowchart LR
  Obj[Kubernetes object] --> Ctl[controller] --> Res[implemented resource] --> Ev[status + provider state + app check]
```

So the useful question is not "did the YAML apply?" but **"which system fulfilled each request, and which assumptions changed?"**

## One booking, more hops

A cloud booking request passes `public DNS → provider load balancer → Gateway proxy → Service → booking Pod → managed database or zonal volume`. Each hop has a different owner and a different place to look for evidence. A successful rollout says nothing about public DNS; a healthy load balancer says nothing about the database. Keep the evidence ladder, and extend it to infrastructure outside Kubernetes.

## "Portable" has levels

| Level | Meaning |
|---|---|
| **Artifact** | The same image runs |
| **API** | Equivalent Kubernetes objects are accepted |
| **Behavioural** | The application meets the same observable needs |
| **Operational** | The team can secure, recover, upgrade and pay for it under the new ownership model |

A system can be artifact- and API-portable and still not operationally portable.

## What to record for each integration

The Kubernetes object, the controller that acts on it, the provider resource it creates, and the passenger-facing check that matters. Apollo has **no verified** cloud deployment (see the [EKS boundary](../../eks)).

## Common misconceptions

- **"If the YAML applies, it works the same."** Controllers and failure domains differ.
- **"A managed service means no responsibility."** Next chapter.
- **"The cloud is just bigger kind."** Zones, billing and identity are new.

## Check yourself

<details>
<summary>The same Service YAML applies on kind and EKS. Is the app portable?</summary>

API-portable at best. Controller, failure domains, identity, backup and cost differ; operational portability must be shown separately.
</details>

## Where this leads

When something spans a provider and your own team, someone must be responsible for each layer. That is ownership.
