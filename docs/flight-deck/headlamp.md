---
title: "Headlamp: The Same Checks in a Graphical UI"
description: "Repeat every inspection from Ignition and Stage 1 in Headlamp: clusters and nodes, control-plane Pods, the ownership chain on the resource map, Service endpoints, config and identity, Jobs, events, logs and rollout history."
sidebar_label: "Headlamp tutorial"
---

# Headlamp: the same checks in a graphical UI

:::info[Page type · flight deck tutorial]
- **Start state:** Stage 1 running on `kind-apollo11`. Optional: the `apollo11-sandbox` cluster from [Contexts and a second cluster](./contexts-and-clusters).
- **Scope:** only the *checks* from [Ignition](../ignition) and [Stage 1](../stage-1). Headlamp shows Edit, Scale, Restart and Delete buttons; this page never uses them.
- **Builds on:** [kubectl: zero to hero](./kubectl-zero-to-hero) and [k9s](./k9s). Each section names the kubectl command and the k9s key it matches.
:::

:::caution[Unverified]
Install commands are from the Headlamp documentation. Menu names and page layouts follow recent Headlamp releases and were not recorded against the pinned commit; labels move between versions. If a section isn't where this page says, use the search box at the top of Headlamp.
:::

**You will be able to:** open any kubeconfig context in Headlamp, find each Stage 1 object, and use the resource map to see how Deployments, ReplicaSets, Pods, Services and config connect.

## Why a graphical UI

| | kubectl | k9s | Headlamp |
|---|---|---|---|
| Where it runs | Terminal | Terminal | Desktop app, or a web app inside the cluster |
| Strongest at | Precision, scripts, docs | Speed by keyboard, live lists | **Seeing relationships**, browsing, showing others |
| Relationships | One query per hop | `Shift-J`, `Enter`, `:xray` | **Map view** and links on every details page |
| Who it suits | Everyone, eventually | People who live in a terminal | Newcomers, demos, reviewing a namespace with a team |

Headlamp is a Kubernetes SIG UI project. Like k9s, it only calls the API server with your kubeconfig credentials: it can see and do exactly what `kubectl` can with the same context. On the kind cluster that is *everything*, because kind gives you an admin user. Headlamp has no read-only switch; the buttons are there because your user is allowed to press them.

## Install and launch

Use the desktop app. It reads `~/.kube/config` (and `KUBECONFIG`) directly, so there is nothing to install in the cluster.

| OS | Command |
|---|---|
| macOS | `brew install --cask headlamp` |
| Windows | `winget install headlamp` (or `choco install headlamp`) |
| Linux | `flatpak install io.kinvolk.Headlamp`, then `flatpak run io.kinvolk.Headlamp`; or the AppImage / tarball from the [releases page](https://github.com/kubernetes-sigs/headlamp/releases/latest) |

- **WSL2:** the kind cluster and its kubeconfig live inside WSL, while the Windows app reads the Windows kubeconfig. Either run the Linux build inside WSL (WSLg shows the window), or in the Windows app use **Add Cluster → Load from KubeConfig** and pick `\\wsl$\<distro>\home\<you>\.kube\config`. The API server is on `127.0.0.1:6443`, which WSL2 forwards to Windows.

### Alternative: run Headlamp inside the cluster

Use this only if a desktop app isn't an option. It installs a web UI into `kube-system`, bound to `cluster-admin` by the chart's defaults, so remove it afterwards.

```bash
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm install headlamp headlamp/headlamp --namespace kube-system
kubectl -n kube-system rollout status deploy/headlamp
kubectl -n kube-system create token headlamp      # paste this token at the login screen
kubectl -n kube-system port-forward svc/headlamp 8080:80
# open http://localhost:8080
# afterwards: helm uninstall headlamp --namespace kube-system
```

- **Why the token:** the in-cluster app has no kubeconfig. You log in with a ServiceAccount token, and you get that ServiceAccount's permissions. This is the same identity mechanism Stage 1 gave every workload, used by a person.
- **Only one cluster:** an in-cluster Headlamp sees only the cluster it runs in. The context-switching section below needs the desktop app.

### Read the screen

- **Home / cluster list:** every context in your kubeconfig, by name: `kind-apollo11`, and `kind-apollo11-sandbox` if you created it. Click one to open it. The cluster name stays in the top bar; check it the way you check the k9s header.
- **Left sidebar:** resources grouped by purpose: **Cluster** (overview, namespaces, nodes), **Workloads** (Pods, Deployments, ReplicaSets, Jobs, DaemonSets, …), **Storage**, **Network** (Services, Endpoints, Ingresses, …), **Security** (ServiceAccounts, Roles, …), **Configuration** (ConfigMaps, Secrets, …), and **Map**.
- **Namespace filter:** in the top bar. Set it to `apollo-airlines` for Stage 1; clear it to see everything.
- **Details pages:** click any name. Each details page shows metadata (labels, annotations, owner), the spec and status in readable form, related objects, and an **Events** section at the bottom. The action icons in the page header include **View YAML**.

## Check 1: which cluster, which nodes

*From Ignition Step 1. kubectl: `kubectl config get-contexts`, `kubectl get nodes -L node-role,workload`. k9s: `:ctx`, `:nodes`.*

1. On the cluster list, open `kind-apollo11`.
2. **Cluster → Overview:** node count, Pod count, CPU and memory capacity, and recent warning events.
3. **Cluster → Nodes:** `apollo11-control-plane`, `apollo11-worker`, `apollo11-worker2`, all Ready.
4. Open `apollo11-worker`: its labels include `node-role: worker` and `workload: app`; further down, the Pods running on it.
5. Open `apollo11-control-plane`: under taints, `node-role.kubernetes.io/control-plane:NoSchedule`. That taint is why Ignition's Pods only ever landed on workers.

## Check 2: the control-plane components

*From Ignition Step 2. kubectl: `kubectl -n kube-system get pods -o wide`, `get daemonsets`. k9s: `:pods kube-system`, `:ds`.*

1. Set the namespace filter to `kube-system`. **Workloads → Pods.**
2. The four static Pods end in `-apollo11-control-plane`. Open `kube-apiserver-apollo11-control-plane`: its owner is the **Node**, not a controller.
3. **Workloads → DaemonSets:** `kube-proxy` and `kindnet`, three Pods each, one per node.

## Check 3: the ownership chain, drawn

*From Stage 1 Step 3. kubectl: `kubectl get deploy,rs,pods -l app=booking` + the `ownerReferences` query. k9s: `Enter`, `Shift-J`, `:xray deploy`.*

1. Namespace filter `apollo-airlines`. **Workloads → Deployments:** ten Deployments (six apps, three Postgres, Redis), each `2/2` or `1/1`.
2. Open `booking`: replicas desired, updated, ready and available, the selector `app=booking`, the strategy (`RollingUpdate`), and the Pod template's container, env sources and readiness probe.
3. **Workloads → ReplicaSets**, open `booking-<hash>`: its owner links back to the Deployment `booking`; its Pods are listed below.
4. Open one of those Pods: the owner link points to the ReplicaSet. Click it to walk back up.
5. Open **Map**. Each Deployment is drawn with its ReplicaSets and Pods, and Services are drawn next to the Pods they select. Click a node in the map to see a summary; click through to its details page. Grouping by namespace keeps the Stage 1 objects together.

- **What the map adds:** kubectl gives you the chain one hop per command; k9s's `:xray` draws it as a text tree; the map draws every chain in the namespace at once, including the *Service* side, which neither ownership query shows. A Service drawn with no Pods next to it is the "selector doesn't match" bug, visible without reading anything.

### Optional: watch self-healing live

Keep **Workloads → Pods** open, filtered to `apollo-airlines`. In a terminal, run the Stage 1 Step 8 delete once more:

```bash
kubectl delete -n apollo-airlines --wait=false \
  $(kubectl get pod -n apollo-airlines -l app=booking -o name | head -1)
```

Headlamp watches the API, so the table updates without a refresh: one booking Pod goes to `Terminating`, a new name appears, and it turns Ready. On the map, the ReplicaSet briefly has three Pods drawn, then two.

## Check 4: how the Service finds Pods

*From Stage 1 Step 4. kubectl: `get svc`, `get endpointslice -l kubernetes.io/service-name=booking`, `get pods -o wide`. k9s: `:svc` + `d`, `:endpointslices`.*

1. **Network → Services**, open `booking`: type `NodePort`, the cluster IP, port `8082` → target `8082`, node port `30082`, and the selector `app=booking`.
2. The Service page lists its endpoints: two Pod addresses on port `8082`. (Or **Network → Endpoints**, open `booking`.)
3. Compare those IPs with **Workloads → Pods** (the IP column), filtered to booking.
4. Open `notification`: type `ClusterIP`, no node port.

## Check 5: configuration and identity

*From Stage 1 Step 5. kubectl: the env JSONPath query, `serviceAccountName`. k9s: `d` on the Pod, `:cm`, `:secrets` + `x`, `u`.*

1. Open a booking Pod. In the container section, each environment variable shows where it comes from: `FLIGHT_SERVICE_URL` from ConfigMap `apollo-airlines-config`, `JWT_SECRET` from Secret `apollo-airlines-secrets`. The Pod's ServiceAccount is `booking`.
2. **Configuration → Config Maps**, open `apollo-airlines-config`: every key and value as a table.
3. **Configuration → Secrets**, open `apollo-airlines-secrets`: values are hidden until you click the reveal (eye) icon, then shown decoded.
4. **Security → Service Accounts:** thirteen Apollo ServiceAccounts plus `default`.

- **What step 3 proves:** hiding values on screen is a UI courtesy, not protection. Anyone whose user may read Secrets sees the password, here, in k9s, or with `kubectl get secret -o jsonpath`. Stage 8 fixes this at the source.
- **Still a kubectl job:** "may this ServiceAccount do X?" is `kubectl auth can-i --as=…`. Headlamp shows Roles and RoleBindings, but doesn't answer the question for you.

## Check 6: the seed Jobs

*From Stage 1 Step 6. kubectl: `get jobs`, `logs job/init-booking-db`. k9s: `:jobs`, `Enter`, `l`.*

1. **Workloads → Jobs:** `init-booking-db`, `init-flight-db`, `init-identity-db`, each with completions `1/1`.
2. Open `init-booking-db`: status `Complete`, backoff limit `3`, and its Pod.
3. Open that Pod and open its logs: the `pg_isready` waits, then the `psql` output.

## Check 7: the evidence ladder on one Pod

*From Ignition Step 6.*

| Rung | kubectl | k9s | Headlamp |
|---|---|---|---|
| 1. Snapshot | `get pod -o wide` | `:pods` row | **Pods** table: Ready, Status, Restarts, IP, Node |
| 2. Events | `kubectl events --for pod/<pod>` | `d` → `Events:` · `:events` | **Events** section at the bottom of the Pod page · warnings on **Cluster → Overview** |
| 3. Spec and conditions | `describe` · `get -o yaml` | `d` · `y` | The Pod page (conditions, containers, probes, mounts) · **View YAML** |
| 4. Logs | `logs` · `logs --previous` | `l` · `p` | **Logs** icon on the Pod page: pick the container, follow, timestamps, and an option for the previous container |
| 5. Live endpoint | `port-forward` + `curl` | `Shift-F` | Desktop app: the port-forward button next to a container port on the Pod or Service page, then `curl` the local port |

- **Same order, any tool.** Status, then events, then spec, then logs, then a real request. The tools only change how many keystrokes each rung costs.

## Check 8: rollout history

*From Stage 1 Step 8. kubectl: `get rs -l app=search`, `rollout history deploy/search`. k9s: `:rs` + `/search` + `y`.*

1. **Workloads → ReplicaSets**, search for `search`: two ReplicaSets, one with 2 Pods and the one for `search:missing-stage1-demo` at 0.
2. Open each, and in its annotations find `deployment.kubernetes.io/revision`. The original ReplicaSet carries the highest number after the undo: `rollout undo` re-promoted it.
3. Open the `search` Deployment and scroll to **Events**: the scale-up of the new ReplicaSet, and the scale-back after the undo.

## Switch to the sandbox

With the desktop app and the `apollo11-sandbox` cluster from the [contexts tutorial](./contexts-and-clusters):

1. Go back to the cluster list (or use the cluster selector in the top bar) and open `kind-apollo11-sandbox`.
2. **Workloads → Deployments** with no namespace filter: CoreDNS, the local-path provisioner, and whatever you created in `practice`.
3. Headlamp can show more than one cluster side by side in its cluster list, and opening a cluster in Headlamp does **not** change `current-context` in your kubeconfig. That makes it a safer place to *look* at a second cluster than switching contexts in a terminal. Confirm with `kubectl config current-context`.

When you are done with the flight deck, delete the sandbox as shown in [Contexts: Clean up](./contexts-and-clusters#clean-up).

## Common misconceptions

| Wrong belief | Correction |
|---|---|
| "A UI is less powerful, so it's safer" | It has exactly your user's permissions. On kind, that's admin: the Delete button works |
| "Hidden Secret values are protected" | They are hidden on screen, not encrypted. One click reveals them |
| "The map is a separate data source" | It is drawn from the same objects: owner references for Deployment → ReplicaSet → Pod, and label selectors for Service → Pod |

## Check yourself

<details>
<summary>On the map, a Service is drawn with no Pods next to it, but the Deployment's Pods are all Ready. What's the likely cause, and how do you confirm it in Headlamp?</summary>

The Service's selector doesn't match the Pods' labels (or `targetPort` points to the wrong port). Open the Service: compare its selector with the labels on one of the Pods, and check that its endpoints list is empty.
</details>

<details>
<summary>You switch to `kind-apollo11-sandbox` in Headlamp, then run `bash stages/stage1/scripts/teardown.sh` in a terminal. Which cluster does the script see?</summary>

Whatever `current-context` was before, normally `kind-apollo11`: opening a cluster in the Headlamp desktop app doesn't edit your kubeconfig. That is the difference from `kubectl config use-context` (and from k9s's `:ctx`, which can write it). If in doubt, `kubectl config current-context`.
</details>

## Back to the mission

You have now seen Stage 1 three ways. Use whichever tool fits the moment; later stages keep giving kubectl commands, because they are precise and copyable, but every check in them has a k9s and a Headlamp equivalent you can now find yourself.

**Next:** return to [Stage 1: Clean up](../stage-1#clean-up), then on to [Stage 2: Guidance](../stage-2).
