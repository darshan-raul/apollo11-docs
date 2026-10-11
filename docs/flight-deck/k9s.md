---
title: "k9s: The Same Checks in a Terminal UI"
description: "Repeat every inspection from Ignition and Stage 1 in k9s: nodes, control-plane Pods, the Deployment → ReplicaSet → Pod chain, Service endpoints, config and identity, Jobs, events, logs and rollout history."
sidebar_label: "k9s tutorial"
---

# k9s: the same checks in a terminal UI

:::info[Page type · flight deck tutorial]
- **Start state:** Stage 1 running on `kind-apollo11`. Optional: the `apollo11-sandbox` cluster from [Contexts and a second cluster](./contexts-and-clusters), to try context switching.
- **Scope:** only the *checks* from [Ignition](../ignition) and [Stage 1](../stage-1). Nothing on this page changes the cluster; k9s runs in read-only mode throughout.
- **Builds on:** [kubectl: zero to hero](./kubectl-zero-to-hero). Each section names the kubectl command it replaces.
:::

:::caution[Unverified]
Key bindings were checked against the k9s README (v0.50 series), not on a recorded run against the pinned commit. If a key does nothing in your version, press `?` for that screen's list.
:::

**You will be able to:** move through a cluster's objects by keyboard, follow ownership and wiring between them, and read events and logs without retyping names.

## Why a terminal UI

| | kubectl | k9s |
|---|---|---|
| Model | One command, one snapshot | A live screen that keeps refreshing (every 2 s by default) |
| Finding things | Type names, selectors, JSONPath | Type a view name, filter as you type, `Enter` to drill down |
| Following links | Copy a name into the next command | Owner, Pods, containers, logs: one key each |
| Scripting, CI, docs | **Yes** | No |
| What it talks to | The API server, via your kubeconfig | The same API server, the same kubeconfig, the same permissions |

k9s doesn't know anything kubectl can't tell you. It saves typing, and its live refresh makes change visible: a Pod going from `Terminating` to a new `Running` Pod is something you watch happen rather than reconstruct from two snapshots.

## Install and launch

```bash
mise use -g k9s          # or: brew install k9s · winget install k9s · see k9scli.io for others
k9s version
k9s --context kind-apollo11 -n apollo-airlines --readonly
```

- **`--readonly`** turns off every key that would change the cluster (delete, edit, scale, shell). Use it on this page, and on any cluster you only came to look at.
- **`--context` / `-n`** pick the starting context and namespace. Without them k9s uses `current-context` and its namespace, like kubectl.
- **Quit** with `:q` or `Ctrl-C`.

### Read the screen

```text
 Context: kind-apollo11                                  <0> all       <d> Describe  ...
 Cluster: kind-apollo11                                  <1> apollo-airlines
 User:    kind-apollo11                                  <2> default
 K9s Rev: v0.50.x
 K8s Rev: v1.3x.x
┌──────────────────────── Pods(apollo-airlines)[14] ─────────────────────────┐
│ NAME↑                     READY  STATUS     RESTARTS  IP           NODE    │
│ booking-6c9f7d…-2xk4q     1/1    Running    0         10.244.1.12  apollo… │
```

- **Top left:** context, cluster and user. This is the first thing to check, every time. It is the k9s version of `kubectl config current-context`.
- **Top middle:** numbered namespaces. `0` = all namespaces, `1`… = recently used ones.
- **Top right:** the keys that work on this screen. They change from view to view.
- **Title bar:** the view, its namespace and the row count. A filter shows up here too.

### The keys you need

| Key | Does |
|---|---|
| `:` + name, `Enter` | Open a view: `:pods`, `:deploy`, `:rs`, `:svc`, `:jobs`, `:cm`, `:secrets`, `:sa`, `:events`, `:nodes`, `:ns`, `:ctx`. Any resource name or short name works, e.g. `:endpointslices` |
| `:pods kube-system` · `:pods app=booking` | A view plus a namespace, or plus a label selector, in one go |
| `/` + text | Filter rows by name (regex). `/-l app=booking` filters by label. `Esc` clears |
| `Enter` | Drill down: Deployment → its Pods, Pod → its containers, Node → its Pods |
| `Esc` | Back up one level |
| `d` · `y` | Describe · YAML of the selected row |
| `l` · `p` | Logs · previous container's logs |
| `Shift-J` | Jump to the selected object's owner |
| `u` | On a ConfigMap, Secret or ServiceAccount: what uses it |
| `:xray deploy apollo-airlines` | A tree of Deployments → ReplicaSets → Pods → containers, with the ConfigMaps, Secrets and ServiceAccounts each one uses |
| `?` | Every key for the current view |
| `Ctrl-A` | Every view name and alias |

## Check 1: which cluster, which nodes

*From Ignition Step 1. kubectl: `kubectl config get-contexts`, `kubectl get nodes -L node-role,workload`.*

1. `:ctx` lists every context in your kubeconfig. The current one is marked. If you created the sandbox, both `kind-apollo11` and `kind-apollo11-sandbox` appear.
2. `:nodes` shows the three Apollo nodes with status, roles, version and age.
3. Select `apollo11-worker` and press `y`: under `metadata.labels` you find `node-role: worker` and `workload: app`, set by `kind-config.yaml`.
4. Press `Enter` on a worker: the Pods scheduled on that node, across all namespaces. `Esc` to go back.

- **What it replaces:** `kubectl get pods -A --field-selector spec.nodeName=apollo11-worker`. Node → Pods is one key here.
- **CPU and memory columns** show `n/a` on the kind cluster: there is no metrics-server yet. That arrives with autoscaling in Stage 7.

## Check 2: the control-plane components

*From Ignition Step 2. kubectl: `kubectl -n kube-system get pods -o wide`, `kubectl -n kube-system get daemonsets`.*

1. `:pods kube-system`.
2. Look for the four static Pods whose names end in `-apollo11-control-plane`: `etcd-…`, `kube-apiserver-…`, `kube-controller-manager-…`, `kube-scheduler-…`.
3. Select `kube-apiserver-apollo11-control-plane` and press `Shift-J`: the owner is the **Node** `apollo11-control-plane`, not a controller. That is what "static Pod, mirrored by the kubelet" looks like.
4. `:ds` (DaemonSets): `kube-proxy` and `kindnet` show `DESIRED 3 / READY 3`, one per node. `Enter` on one lists its three Pods, one per node.

## Check 3: the ownership chain

*From Stage 1 Step 3. kubectl: `kubectl get deploy,rs,pods -l app=booking` and the `ownerReferences` custom-columns query.*

1. `:deploy` in `apollo-airlines`. Every app shows `READY 2/2`.
2. Select `booking`, press `Enter`: the two booking Pods. The Deployment → Pods step went through the ReplicaSet without you naming it.
3. Select one Pod, press `Shift-J`: k9s jumps to its owner, the **ReplicaSet** `booking-<hash>`. Press `y` on it and read `metadata.ownerReferences`: `kind: Deployment, name: booking`.
4. `:rs` and `/booking`: the ReplicaSet with `DESIRED 2 CURRENT 2 READY 2`.
5. `:xray deploy apollo-airlines`, then `/booking`: the whole chain as one tree, Deployment → ReplicaSet → Pods → container, with the ConfigMap, Secret and ServiceAccount hanging off the Pods. This is the closest thing to `kubectl tree` without a plugin.

- **What it shows:** the same chain as the kubectl query, walked in the other direction: Pod → ReplicaSet → Deployment.
- **Pod names:** the prefix of every booking Pod is the ReplicaSet's name. k9s doesn't hide that; it just saves you copying it.

### Optional: watch self-healing live

Leave k9s on `:pods` with `/-l app=booking`. In another terminal, run the self-healing command from Stage 1 Step 8 (this is the only line on this page that changes anything, and it is the one the walkthrough already ran):

```bash
kubectl delete -n apollo-airlines --wait=false \
  $(kubectl get pod -n apollo-airlines -l app=booking -o name | head -1)
```

- **What you see in k9s:** the deleted Pod turns to `Terminating`, a new row appears with a new name in `ContainerCreating`, then `Running` with `READY 0/1`, then `1/1`. The count never stays below two for long.
- **Compared with kubectl:** `kubectl get pods -w` prints the same transitions as separate lines. k9s updates the rows in place, so the "two replicas" invariant is visible.

## Check 4: how the Service finds Pods

*From Stage 1 Step 4. kubectl: `kubectl get svc booking`, `kubectl get endpointslice -l kubernetes.io/service-name=booking -o wide`, `kubectl get pods -l app=booking -o wide`.*

1. `:svc`, select `booking`. The row shows `TYPE NodePort`, the `CLUSTER-IP`, and ports `8082►30082`.
2. Press `d`. In the describe output, `Selector: app=booking` and `Endpoints:` with two `IP:8082` entries.
3. `:endpointslices`, then `/booking`. Press `y`: each entry under `endpoints:` has an address and `conditions.ready: true`.
4. `:pods`, `/-l app=booking`. The `IP` column matches the addresses in the EndpointSlice.
5. Do the same for `notification`: `:svc` shows `ClusterIP`, no node port. Only booking calls it.

- **The silent-failure check:** if a Service's describe shows `Endpoints: <none>` while its Pods are `Running`, the selector or readiness is wrong. That is row one of Stage 1's "When something looks wrong" table, found in three keystrokes.

## Check 5: configuration and identity

*From Stage 1 Step 5. kubectl: the env JSONPath query on `deploy/booking`, `kubectl get pod … -o jsonpath='{…serviceAccountName}'`.*

1. `:pods`, select a booking Pod, press `d`. Under `Environment:` every variable lists its source, e.g. `FLIGHT_SERVICE_URL: <set to the key 'FLIGHT_SERVICE_URL' of config map 'apollo-airlines-config'>` and `JWT_SECRET: <set to the key 'JWT_SECRET' in secret 'apollo-airlines-secrets'>`. Further up: `Service Account: booking`.
2. `:cm`, select `apollo-airlines-config`, press `d`: every key and value.
3. `:secrets`, select `apollo-airlines-secrets`, press `x` (decode). The password and JWT key appear in plain text.
4. `:sa`: thirteen ServiceAccounts, one per workload and Job, plus `default`.
5. Back on `:cm` (or `:secrets`), select `apollo-airlines-config` and press `u` (*used by*): every Pod that reads it. This is the list of Pods that need a restart when the ConfigMap changes, because env vars are only read at start-up.

- **What step 3 proves:** a Secret is base64, not encrypted. Anyone who can read Secrets in this namespace can read the password, in any tool. That is exactly the limitation Stage 1 hands to Stage 8.
- **No k9s equivalent** for `kubectl auth can-i --as=…`. Permission questions stay a kubectl job.

## Check 6: the seed Jobs

*From Stage 1 Step 6. kubectl: `kubectl get jobs`, `kubectl logs job/init-booking-db`.*

1. `:jobs`. Three `init-*-db` Jobs, each `COMPLETIONS 1/1`.
2. Select `init-booking-db`, press `Enter`: its Pod, with status `Completed`.
3. Press `l` on that Pod: the `pg_isready` wait lines, then the `psql` output from loading `init.sql`.
4. Back on the Job, press `d`: `Pods Statuses: 0 Active / 1 Succeeded / 0 Failed`, `Backoff Limit: 3`.

## Check 7: the evidence ladder on one Pod

*From Ignition Step 6. The five rungs, each one key away:*

| Rung | kubectl | k9s |
|---|---|---|
| 1. Snapshot | `kubectl get pod <pod> -o wide` | The `:pods` row: `READY`, `STATUS`, `RESTARTS`, `IP`, `NODE` |
| 2. Events | `kubectl events --for pod/<pod>` | `d`, scroll to `Events:`; or `:events` for the whole namespace, newest first |
| 3. Spec and conditions | `kubectl describe pod <pod>` | `d` (conditions, probes, mounts) · `y` (the stored object) |
| 4. Logs | `kubectl logs <pod>` / `--previous` | `l` / `p`. In the log view: `s` toggles autoscroll, `w` wraps lines, `t` adds timestamps |
| 5. Live endpoint | `kubectl port-forward svc/booking 18082:8082` | On the Pod, `Shift-F`, accept the suggested port. `:pf` lists active forwards. Then `curl localhost:<port>/readyz` |

- **Port-forwards live as long as the k9s session.** Quit k9s and they close.
- **Port-forward and `--readonly`:** a port-forward changes no object, but if `Shift-F` is disabled in read-only mode in your version, run `kubectl port-forward` in another terminal instead.
- **Status colours:** k9s colours rows by health (for example, errors in red, Pods still starting in another colour). Use colour to spot a row, then read the `STATUS` column; don't rely on colour alone.

## Check 8: rollout history

*From Stage 1 Step 8, after the bad `search` image and the `rollout undo`. kubectl: `kubectl get rs -l app=search`, `kubectl rollout history deploy/search`.*

1. `:rs`, `/search`. Two ReplicaSets: the original, back at `DESIRED 2`, and the one created for `search:missing-stage1-demo`, now at `0`.
2. Select each and press `y`: under `metadata.annotations`, `deployment.kubernetes.io/revision`. After the undo, the original ReplicaSet carries the *highest* revision number: `rollout undo` re-promoted it rather than creating a third ReplicaSet.
3. `:deploy`, select `search`, `d`: `OldReplicaSets` and `NewReplicaSet` name both, and the `Events:` section shows the scale-up and scale-down sequence.

## Switch to the sandbox

If you created `apollo11-sandbox`:

1. `:ctx`, select `kind-apollo11-sandbox`, `Enter`. The header's `Context:` changes. Depending on your k9s version and settings, this may also write `current-context` to your kubeconfig, like `kubectl config use-context`, so run `kubectl config current-context` afterwards before trusting a bare kubectl command.
2. `:deploy` with `0` (all namespaces): only CoreDNS and the local-path provisioner, plus whatever you created in the `practice` namespace.
3. `:ctx` back to `kind-apollo11` before you leave.

To look at a second cluster *without* switching anything, open another terminal and start a second k9s with `k9s --context kind-apollo11-sandbox`.

## Common misconceptions

| Wrong belief | Correction |
|---|---|
| "k9s shows more than kubectl can" | It shows the same API objects. Anything in k9s has a kubectl command behind it |
| "Read-only k9s is safe on any cluster" | It is safe from *k9s* changing things. It still reads Secrets (`x` decodes them) if your user may read them |
| "A k9s context switch only affects k9s" | It can write `current-context` to the shared kubeconfig, which kubectl, Helm and the Stage scripts read. Check before you switch tools |

## Check yourself

<details>
<summary>A Service has Pods that are `Running`, but callers get errors. What do you look at in k9s, in order?</summary>

`:svc`, `d` on the Service: is `Endpoints` empty? If yes, compare its `Selector` with the Pods' labels (`:pods`, `y`), then check the Pods' `READY` column; `0/1` means readiness is failing, and `d` on the Pod shows the probe and its events.
</details>

<details>
<summary>From a booking Pod, how many keystrokes to reach the Deployment that owns it?</summary>

`Shift-J` reaches the ReplicaSet; its YAML (`y`) names the Deployment in `ownerReferences`; `:deploy` then `/booking` takes you there. kubectl needs a JSONPath query per hop.
</details>

**Next:** [Headlamp](./headlamp) does the same checks in a browser-style UI, with a map of how the objects connect.
