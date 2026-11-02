---
title: "Rollouts and rollback"
description: "Applying Deployment rollouts to Apollo: the pace with two replicas, why a bad release stalls instead of breaking, what triggers a rollout, and what rollback cannot undo."
---

# Rollouts and rollback

*Stage 1 · Liftoff*

**You will be able to:** predict how a booking rollout proceeds with two replicas, explain why a bad release stalls without an outage, say which changes start a rollout and which do not, and list what `rollout undo` cannot restore.

[Deployments](../cluster/deployments) introduced the mechanism: one ReplicaSet per template version, replicas shifted across, gated on readiness. This chapter applies it to Apollo's services, where releases touch databases, configuration and other services, and where "roll back" has limits you need to plan for.

## The pace with two replicas

Apollo's services run `replicas: 2` with the default strategy. The defaults round differently:

- `maxSurge: 25%` of 2 = 0.5, **rounded up** to 1: one extra Pod may exist.
- `maxUnavailable: 25%` of 2 = 0.5, **rounded down** to 0: no Pod may be missing.

```mermaid
flowchart TB
  s0["old 2 · new 0"] -->|"surge 1"| s1["old 2 · new 1<br/>(new must be Ready)"]
  s1 -->|"retire 1 old"| s2["old 1 · new 1"]
  s2 -->|"surge 1"| s3["old 1 · new 2<br/>(new must be Ready)"]
  s3 -->|"retire 1 old"| s4["old 0 · new 2"]
```

So a booking rollout starts one new Pod and removes no old Pod until that new one is **Ready**. Two ready Pods serve throughout.

## Why a bad release stalls instead of breaking

```mermaid
sequenceDiagram
  participant D as booking Deployment
  participant Old as old ReplicaSet (2 Ready)
  participant New as new ReplicaSet
  D->>New: scale to 1
  Note over New: ImagePullBackOff, or crash, or readiness failing
  Note over D: waits: no new Pod is Ready
  Note over Old: still 2 Ready, still serving passengers
  Note over D: after progressDeadlineSeconds: Progressing=False
```

If the new Pod cannot pull its image, crashes on start, or keeps failing its readiness probe, it never becomes Ready, so the old Pods are never removed. Passengers keep being served by the old version. The rollout reports `Progressing=False` once its deadline passes.

The safety net is only as good as the **readiness check**. If booking's `/readyz` returns 200 while it cannot reach its database, a broken release becomes Ready, old Pods are retired, and the outage arrives on schedule. Stage 4's [probes](../reliability/probes) chapter covers what readiness should test.

## Knobs that shape a rollout

| Field or command | Default | What it changes |
|---|---|---|
| `maxSurge` / `maxUnavailable` | 25% / 25% | How many Pods may be added or missing at once (above) |
| `minReadySeconds` | 0 | How long a new Pod must stay Ready before it counts as available. Catches versions that pass readiness, then crash a few seconds later |
| `progressDeadlineSeconds` | 600 | How long without progress before the Deployment reports `Progressing=False` (reason `ProgressDeadlineExceeded`). It reports; it does not roll back |
| `revisionHistoryLimit` | 10 | How many old ReplicaSets are kept, and so how far back `rollout undo` can go |
| `kubectl rollout pause` / `resume` | | Stop acting on template changes, make several edits, then roll them out as one revision |
| `kubectl rollout status --timeout` | | Waits for the rollout and exits non-zero if it fails or times out: the check a script or CI job should use |

Nothing in Kubernetes rolls back by itself. A stalled rollout stays stalled until a person or a tool runs `undo` or ships a fix. The planned Stage 10 Argo Rollouts mission adds automated analysis and rollback.

## What starts a rollout, and what does not

A rollout starts only when the **Pod template** changes. That catches people out with configuration:

| Change | New ReplicaSet and rollout? |
|---|---|
| Image tag | Yes |
| A literal `env` value in the template | Yes |
| Probes, resources, labels in the template | Yes |
| `replicas` | No: the current ReplicaSet is just resized |
| Editing a **ConfigMap or Secret** the Pods read | **No.** Pods keep the values they started with (env vars), or see the file change only if the app re-reads it |
| `kubectl rollout restart` | Yes: it adds a timestamp annotation to the template |

To roll out a configuration change, either run `kubectl rollout restart`, or make the template depend on the config (for example, an annotation holding a hash of the ConfigMap, which tools like Helm and Kustomize can generate).

## What rollback restores

`kubectl rollout undo` copies the previous ReplicaSet's template back into the Deployment, and the same rolling process runs towards it. It restores the **Pod template** and nothing else.

```mermaid
flowchart LR
  subgraph In["Inside the template: restored"]
    direction TB
    i1["image"]
    i2["literal env values"]
    i3["probes, resources"]
  end
  subgraph Out["Outside the template: not restored"]
    direction TB
    o1["ConfigMap / Secret edits"]
    o2["rows the bad version wrote"]
    o3["emails or SMS already sent"]
    o4["payments, consumed queue messages"]
    o5["schema migrations it ran"]
  end
```

Plan releases so that going back is safe.

### Expand, deploy, contract

When a release changes the database schema, split it so both the old and new code can run against the database at every moment:

```mermaid
flowchart TB
  e["Expand<br/>add new columns/tables,<br/>backwards-compatible"] --> d["Deploy<br/>roll out new code;<br/>rollback still safe"] --> c["Contract<br/>once stable, remove<br/>what old code needed"]
```

1. **Expand:** add the new columns or tables without removing anything. Old and new code both work.
2. **Deploy** the new version. A rollback is safe, because the old code still works on the expanded schema.
3. **Contract:** once the new version has proven itself, remove the old columns in a later release.

During a rolling update, old and new Pods serve at the same time anyway, so this discipline is needed even when nothing goes wrong.

## Diagnose a rollout

```bash
kubectl rollout status deploy/booking -n apollo-airlines --timeout=30s
kubectl get rs,pods -n apollo-airlines -l app=booking
kubectl describe pod -n apollo-airlines -l app=booking | grep -E 'Failed|BackOff|Readiness'
kubectl rollout history deploy/booking -n apollo-airlines
kubectl rollout undo deploy/booking -n apollo-airlines
```

| Stuck with | Likely cause |
|---|---|
| `ImagePullBackOff` | Wrong tag or registry: the kubelet cannot pull |
| `Running`, `0/1` Ready | Readiness failing: bad config or a dependency it cannot reach |
| `Pending` | Scheduling or quota: no room for the surge Pod |

## Try it

:::caution[Unverified]
Not yet run on a live cluster for this documentation revision. Uses a throwaway namespace on any cluster.
:::

See which changes start a rollout, and what `undo` leaves behind:

```bash
kubectl create namespace roll-demo
kubectl -n roll-demo create configmap app-config --from-literal=COLOR=blue
kubectl -n roll-demo create deployment web --image=nginx:1.27-alpine --replicas=2
kubectl -n roll-demo set env deploy/web --from=configmap/app-config
kubectl -n roll-demo rollout status deploy/web
kubectl -n roll-demo rollout history deploy/web             # 2 revisions: create, then set env

# Scaling does not create a revision
kubectl -n roll-demo scale deploy/web --replicas=3
kubectl -n roll-demo get rs                                 # still one ReplicaSet with Pods

# Editing the ConfigMap does not start a rollout, and Pods keep the old value
kubectl -n roll-demo patch configmap app-config -p '{"data":{"COLOR":"green"}}'
kubectl -n roll-demo exec deploy/web -- printenv COLOR      # blue
kubectl -n roll-demo rollout restart deploy/web             # adds a restartedAt annotation
kubectl -n roll-demo rollout status deploy/web
kubectl -n roll-demo exec deploy/web -- printenv COLOR      # green

# Undo restores the template, not the ConfigMap
kubectl -n roll-demo rollout undo deploy/web
kubectl -n roll-demo rollout status deploy/web
kubectl -n roll-demo exec deploy/web -- printenv COLOR      # still green
kubectl delete namespace roll-demo
```

- `scale` resized the current ReplicaSet; only template changes made new revisions.
- The ConfigMap edit reached running Pods only after a restart, and `undo` could not take it back.

## Common misconceptions

- **"A stalled rollout means an outage."** The old Pods usually keep serving.
- **"Rollback undoes the release."** It restores the template, not its side effects.
- **"Editing a ConfigMap rolls out the change."** It does not touch the template, so no rollout starts.
- **"Rollback fixes a bad ConfigMap."** The ConfigMap is outside the template; undo leaves it as it is.

## Check yourself

<details>
<summary>Why did users keep getting 200s during a stalled booking rollout?</summary>

The new Pod never became Ready, so the old Pods were never removed.
</details>

<details>
<summary>You change <code>LOG_LEVEL</code> in booking's ConfigMap. Why does nothing happen, and how do you apply it?</summary>

The Pod template did not change, so the Deployment does nothing, and running processes keep the value they read at start. Run `kubectl rollout restart deploy/booking`, or tie the template to the ConfigMap's content.
</details>

<details>
<summary>Does rolling back undo a booking written by the buggy version?</summary>

No. Rollback restores the Pod template only; data and external effects stay.
</details>

## Where this leads

Rollback cannot restore data that lived in a Pod that no longer exists. The last Liftoff chapter, [Ephemeral state](./ephemeral-state), names exactly what a replacement Pod loses.

## References

- [Deployments: rolling update, progress deadline, history](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [`kubectl rollout`](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/)
