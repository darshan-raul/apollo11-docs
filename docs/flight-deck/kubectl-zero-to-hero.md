---
title: "kubectl: Zero to Hero"
description: "Learn kubectl properly on the running Stage 1 airline: how it talks to the API server, how to find any resource, shape output, follow change, inspect running Pods, and preview changes before making them."
sidebar_label: "kubectl: zero to hero"
---

# kubectl: zero to hero

:::info[Page type · flight deck tutorial]
- **Start state:** Stage 1 is running on `kind-apollo11` (namespace `apollo-airlines`). If you already tore it down: `bash stages/stage1/scripts/apply.sh --skip-build`.
- **Builds on:** every command you ran in [Ignition](../ignition) and [Stage 1](../stage-1). This page explains the tool behind them.
- **Next in the flight deck:** [Contexts and a second cluster](./contexts-and-clusters) · [k9s](./k9s) · [Headlamp](./headlamp)
:::

**You will be able to:** find any object in a cluster without memorising its fields, get exactly the column you need out of it, and check a change before it reaches the cluster.

So far, `kubectl` commands have been handed to you one by one. This page explains the tool itself, so you can write your own commands. Every example runs against the Stage 1 airline. Everything up to the [preview section](#7-preview-a-change-before-making-it) only reads from the cluster.

## 1. What kubectl actually is

`kubectl` is an HTTP client for the API server. It reads a **kubeconfig** file to learn three things: which cluster (URL and CA), which user (credentials), and which namespace. It then turns your command into REST calls.

```bash
kubectl config current-context                     # kind-apollo11
kubectl get pods -n apollo-airlines -v=6 2>&1 | grep -E 'GET|Config loaded'
```

```text
Config loaded from file:  /home/you/.kube/config
GET https://127.0.0.1:6443/api/v1/namespaces/apollo-airlines/pods?limit=500 200 OK in 7 milliseconds
```

- **`-v=6`** prints each HTTP request. `-v=8` also prints response bodies. Useful when a command behaves differently than you expect.
- **One API for everything.** `get pods` is `GET …/pods`. `apply` is a `PATCH` or `POST`. `delete` is a `DELETE`. There is no other back door; [k9s](./k9s) and [Headlamp](./headlamp) make the same calls.
- **Which cluster and user** come from the current context. The [next page](./contexts-and-clusters) is about switching it safely.

## 2. Command grammar

Almost every command follows one shape:

```text
kubectl <verb> <type>[/<name>] [flags]
kubectl get    deploy/booking  -n apollo-airlines -o yaml
```

| Part | Examples | Notes |
|---|---|---|
| Verb | `get`, `describe`, `logs`, `apply`, `delete`, `explain` | `kubectl --help` lists them by group |
| Type | `pods` / `pod` / `po`, `deployments` / `deploy`, `services` / `svc` | Singular, plural and short names all work |
| Name | `booking`, `deploy/booking` | `type/name` lets you mix types: `get deploy/booking svc/booking` |
| Scope | `-n apollo-airlines`, `-A` | `-A` = all namespaces |
| Selection | `-l app=booking`, `--field-selector status.phase=Running` | Filters on the server side |
| Output | `-o wide`, `-o yaml`, `-o name`, `-o jsonpath=…` | See section 4 |

Stop typing `-n apollo-airlines` on every line by setting the namespace on the context:

```bash
kubectl config set-context --current --namespace=apollo-airlines
kubectl config view --minify -o jsonpath='{..namespace}{"\n"}'   # apollo-airlines
```

The rest of this page assumes you did this. Undo it with `--namespace=default` when you leave Stage 1.

## 3. Discover: find out what exists and what fields it has

You don't need to memorise the API. The cluster describes itself.

```bash
kubectl api-resources --namespaced=true | head        # every type, short name, API group, kind
kubectl api-resources | grep -i endpoint              # endpointslices  discovery.k8s.io/v1  true  EndpointSlice
kubectl explain deployment.spec.strategy              # field docs, straight from the API server
kubectl explain deployment.spec.strategy.rollingUpdate.maxUnavailable
kubectl explain pod.spec.containers.readinessProbe --recursive | head -20
```

- **`api-resources`** answers "what's the short name?" and "is it namespaced?". `NAMESPACED=false` objects (Nodes, Namespaces, ClusterRoles) ignore `-n`.
- **`explain`** answers "what is this field and what type does it take?". It reads the schema from *your* cluster's version, so it is never out of date the way a blog post can be.
- **`get all` is not all.** It covers a fixed set (Pods, Services, Deployments, ReplicaSets, Jobs …). ConfigMaps, Secrets, ServiceAccounts and EndpointSlices are not in it.

## 4. Read: get, describe, and shaping output

### Selecting

```bash
kubectl get pods --show-labels                                 # every label as a column
kubectl get pods -L app                                        # one label as its own column
kubectl get pods -l app=booking                                # equality
kubectl get pods -l 'app in (booking,flight,search)'           # set
kubectl get pods -l 'app,app notin (redis)'                    # has the label, but not redis
kubectl get pods --field-selector=status.phase!=Running        # anything not running
kubectl get pods -o wide --sort-by=.spec.nodeName              # grouped by node
kubectl get events --sort-by=.lastTimestamp | tail             # most recent last
```

- **Label selectors** are the same language the Service and the Deployment use. `-l app=booking` selects exactly the Pods the `booking` Service sends traffic to (minus the not-Ready ones).
- **Field selectors** only support a few fields per type (`metadata.name`, `status.phase`, `spec.nodeName` for Pods). For anything else, use JSONPath or `jq`.

### Shaping

| Output | Use it for | Example |
|---|---|---|
| `-o wide` | Node, IP, selector at a glance | `kubectl get pods -o wide` |
| `-o yaml` / `-o json` | The whole stored object, including `status` | `kubectl get deploy booking -o yaml` |
| `-o name` | Feeding into another command | `kubectl get pods -l app=booking -o name` → `pod/booking-…` |
| `-o custom-columns=` | Your own table | below |
| `-o jsonpath=` | One value, or a loop | below |
| `-o json \| jq` | Anything JSONPath makes awkward | below |

```bash
# Who owns each Pod, and where does it run?
kubectl get pods -o custom-columns='POD:.metadata.name,OWNER:.metadata.ownerReferences[0].name,NODE:.spec.nodeName,IP:.status.podIP'

# Every image running in the namespace
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Restart counts above zero
kubectl get pods -o json | jq -r '.items[] | select(.status.containerStatuses[0].restartCount > 0) | "\(.metadata.name) \(.status.containerStatuses[0].restartCount)"'

# The Secret Stage 1 says is "only base64"
kubectl get secret apollo-airlines-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d; echo
```

- **JSONPath** basics: `.items[*]` loops a list, `{range …}{end}` repeats a template per item, `[?(@.type=="Ready")]` filters a list, `{"\n"}` adds a newline.
- **Find the path** to a field by reading `-o yaml` first, then trimming it into JSONPath. That is how every one-liner in the walkthroughs was written.

### describe vs get -o yaml

| | `describe` | `get -o yaml` |
|---|---|---|
| Format | Human summary | The exact stored object |
| Events | **Included** at the bottom | Not included |
| Related objects | Some (a Service's endpoints, a Deployment's ReplicaSets) | None |
| Use it for | "What is wrong?" | "What exactly is set?", writing JSONPath, copying a field |

## 5. Follow change over time

```bash
kubectl get pods -l app=booking -w                            # stream changes (Ctrl-C to stop)
kubectl get pods -l app=booking -w --output-watch-events      # prefix ADDED / MODIFIED / DELETED
kubectl events --for deploy/booking                           # events for one object
kubectl events --types=Warning                                # only warnings, whole namespace
kubectl rollout status deploy/booking                         # block until the rollout ends
kubectl rollout history deploy/search                         # revisions the Deployment kept
kubectl wait --for=condition=complete job/init-booking-db --timeout=60s
kubectl wait --for=jsonpath='{.status.readyReplicas}'=2 deploy/booking --timeout=60s
```

- **`-w`** keeps one connection open and prints every change. `--output-watch-events` shows *why* a line appeared: it is the cleanest way to see Stage 1's self-healing (`DELETED` one Pod, `ADDED` another).
- **`kubectl events`** is the newer, friendlier form of `get events`: sorted, filterable by object (`--for`) and type.
- **`wait`** is for scripts. It is how `apply.sh` knows a phase has finished before starting the next.

## 6. Look inside running Pods

```bash
kubectl logs deploy/booking                          # one Pod of the Deployment, picked for you
kubectl logs -l app=booking --prefix --tail=20       # all booking Pods, each line tagged with its Pod
kubectl logs deploy/booking --since=10m -f           # follow, last 10 minutes
kubectl logs job/init-booking-db                     # the Job's Pod
kubectl logs <pod> --previous                        # the container before the last restart

kubectl exec deploy/booking -- env | grep SERVICE_URL     # what config actually reached the process
kubectl exec -it deploy/booking -- sh                     # if the image has a shell

kubectl port-forward svc/booking 18082:8082               # tunnel to the Service
curl -s localhost:18082/readyz
```

- **`deploy/booking` instead of a Pod name:** `logs`, `exec` and `port-forward` accept a workload and pick one of its Pods. You stop copy-pasting hash suffixes.
- **`exec … env`** is the last word on configuration: the Deployment says what *should* be injected, the process environment says what *was*.
- **`port-forward svc/…`** goes to one Pod behind the Service, chosen once. It is a check, not load balancing.
- **No shell in the image?** `kubectl debug -it <pod> --image=busybox:1.36.1 --target=<container>` adds a temporary debug container that shares the Pod's process namespace.

## 7. Preview a change before making it

These commands are the "measure twice" half of changing a cluster. None of them change anything.

```bash
kubectl diff -k stages/stage1/k8s                       # live objects vs the files
kubectl apply -k stages/stage1/k8s --dry-run=server     # what the API server would accept
kubectl set image deploy/search search=apollo11/search:v2 --dry-run=server -o yaml | grep image:
kubectl scale deploy/booking --replicas=3 --dry-run=server -o jsonpath='{.spec.replicas}{"\n"}'
kubectl auth can-i delete deployments                   # yes: the kind admin can do anything
kubectl auth can-i --list --as=system:serviceaccount:apollo-airlines:booking | head
kubectl auth whoami                                     # which user the API server thinks you are
```

- **`diff`** compares the live objects with what `apply` would produce. Empty output means "the cluster matches the files". Any output is a difference to read: a field someone changed by hand (Stage 1 Step 8 changed `search`), or a value the files set differently. Exit code `1` means differences were found, not that the command failed.
- **`--dry-run=server`** runs the request through validation, defaults and admission, then throws it away. `--dry-run=client` only checks the YAML locally.
- **`auth can-i`** asks the API server whether a request would be allowed. With `--as` you can ask on behalf of a ServiceAccount, as in Stage 1 Step 5.

The commands that *do* change things, for reference. You have used all of them already; practise them on the [sandbox cluster](./contexts-and-clusters), not on Apollo.

| Command | What it changes |
|---|---|
| `apply -f` / `apply -k` | Creates or updates objects to match files |
| `create deployment` / `run` | Creates an object imperatively |
| `set image`, `set env` | Edits the Pod template, so it triggers a rollout |
| `scale` | `spec.replicas` |
| `rollout restart` / `rollout undo` | New rollout from the same template / the previous ReplicaSet |
| `label`, `annotate` | Metadata (can move a Pod out of a Service!) |
| `edit`, `patch` | Any field, in an editor or inline |
| `delete` | Removes the object; owners may recreate it |

## 8. Make it fast

```bash
# Completion (bash; use `kubectl completion zsh` for zsh)
source <(kubectl completion bash)
alias k=kubectl
complete -o default -F __start_kubectl k
```

Add those lines to `~/.bashrc`. Tab now completes verbs, types, **and live object names**: `k logs deploy/bo<Tab>`.

| Habit | Why |
|---|---|
| Namespace on the context, not `-n` on every command | Fewer typos, fewer "No resources found" |
| `deploy/x` instead of Pod names | Names with hash suffixes change on every rollout |
| `-o name` + `xargs` or `$( )` | Compose commands without parsing tables |
| `--dry-run=server` and `diff` before `apply` | You see the change before the cluster does |
| Check `kubectl config current-context` before anything destructive | The [next page](./contexts-and-clusters) shows why |

**Optional plugins.** [krew](https://krew.sigs.k8s.io/) is the kubectl plugin manager. Two plugins fit this stage: `kubectl tree deploy/booking` draws the Deployment → ReplicaSet → Pod chain, and `kubectl neat` strips status and defaults from `-o yaml`. Nothing in the course depends on them.

## Putting it together: investigate booking with one tool

The evidence ladder from Ignition, using only what this page covered:

| Rung | Command | Question |
|---|---|---|
| 1. Snapshot | `kubectl get deploy,rs,pods -l app=booking -o wide` | How many, which version, which node? |
| 2. Events | `kubectl events --for deploy/booking` and `--for pod/<pod>` | What did controllers and the kubelet decide? |
| 3. Spec and conditions | `kubectl describe pod -l app=booking` | Which image, env sources, probe, conditions? |
| 4. Logs | `kubectl logs -l app=booking --prefix --tail=50` | What did the process say? |
| 5. Live endpoint | `kubectl port-forward svc/booking 18082:8082` + `curl localhost:18082/readyz` | Does a caller get the right answer? |

Plus the Service wiring, which is the most common silent failure:

```bash
kubectl get svc booking -o jsonpath='{.spec.selector}{"\n"}'
kubectl get endpointslice -l kubernetes.io/service-name=booking \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

## Check yourself

<details>
<summary>You need the field that sets how long a Pod gets to shut down. How do you find it without a search engine?</summary>

`kubectl explain pod.spec | grep -i grace` finds `terminationGracePeriodSeconds`; `kubectl explain pod.spec.terminationGracePeriodSeconds` explains it.
</details>

<details>
<summary>`kubectl get all` shows no ConfigMap. Is the ConfigMap missing?</summary>

No. `get all` covers a fixed list of types that doesn't include ConfigMaps, Secrets, ServiceAccounts or EndpointSlices. Ask for the type: `kubectl get cm`.
</details>

<details>
<summary>`kubectl logs deploy/booking` shows a single Pod's output, but there are two booking Pods. How do you see both?</summary>

`kubectl logs deploy/booking` picks one Pod. Select by label instead: `kubectl logs -l app=booking --prefix`. `--prefix` tags each line with the Pod it came from.
</details>

**Next:** [Contexts and a second cluster](./contexts-and-clusters): the one kubectl setting that decides *which* cluster all of the above hits.
