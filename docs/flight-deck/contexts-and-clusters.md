---
title: "Contexts and a Second Cluster"
description: "Read a kubeconfig, add a small side kind cluster next to Apollo, switch between clusters on purpose, and build the habits that stop a command from landing on the wrong one."
sidebar_label: "Contexts and a second cluster"
---

# Contexts and a second cluster

:::info[Page type · flight deck tutorial]
- **Start state:** Stage 1 running on `kind-apollo11`. You will add a second, throwaway cluster `apollo11-sandbox` and delete it at the end.
- **Needs:** about 1 GB of free RAM for one more kind node. The sandbox maps no host ports, so it does not clash with `apollo11`.
- **Builds on:** [kubectl: zero to hero](./kubectl-zero-to-hero).
:::

**You will be able to:** read a kubeconfig, run two clusters side by side, aim each command at the cluster you mean, and recover when a tool switches context behind your back.

## The problem

Every `kubectl` command so far went to "the cluster", because there was only one. In real work there are always several: a local cluster, a shared dev cluster, staging, production. `kubectl delete deploy booking` is the same command on all of them. The only thing that decides which cluster it hits is a setting most people never look at: the **current context**.

The Stage 1 scripts already protect you from this: `apply.sh`, `verify.sh` and `teardown.sh` refuse to run unless the context is `kind-apollo11` or `kind-apollo11-dev`. This page shows why that guard is there.

## The idea in plain words

A **kubeconfig** (by default `~/.kube/config`) is an address book with three lists, plus a bookmark:

| Entry | Holds | Apollo example |
|---|---|---|
| `clusters` | API server URL and the CA that signs its certificate | `kind-apollo11` → `https://127.0.0.1:6443` |
| `users` | Credentials: client certificate, token, or an exec plugin (cloud CLIs) | `kind-apollo11` → a client cert kind generated |
| `contexts` | A named triple: **cluster + user + default namespace** | `kind-apollo11` = cluster `kind-apollo11`, user `kind-apollo11`, namespace `apollo-airlines` (if you set it) |
| `current-context` | The bookmark: which context to use when you don't say | `kind-apollo11` |

- A **context** is not a cluster. Two contexts can point at the same cluster with different users or namespaces.
- **Every tool reads the same file.** kubectl, Helm, k9s, Headlamp, kind and the Stage scripts all follow `current-context` unless told otherwise. Change it in one, and it changes for all.

```bash
kubectl config get-contexts
kubectl config view --minify          # only the current context's cluster, user and namespace
```

```text
CURRENT   NAME            CLUSTER         AUTHINFO        NAMESPACE
*         kind-apollo11   kind-apollo11   kind-apollo11   apollo-airlines
```

## How it works: add a second cluster

### Step 1: Create the sandbox and notice what kind did

```bash
kind create cluster --name apollo11-sandbox      # one node, default settings, no port mappings
kubectl config current-context
```

```text
kind-apollo11-sandbox
```

- **What happened:** kind added a cluster, a user and a context called `kind-apollo11-sandbox` to `~/.kube/config`, **and switched `current-context` to it**.
- **Why it matters:** you didn't ask to switch. Any `kubectl` command you type next now goes to the sandbox. Tools that create clusters (kind, minikube, k3d, `aws eks update-kubeconfig`, `gcloud … get-credentials`) all do this.

```bash
kubectl config get-contexts
kubectl get nodes
kubectl get ns apollo-airlines           # NotFound: this cluster has never heard of Apollo
```

```text
CURRENT   NAME                    CLUSTER                 AUTHINFO                NAMESPACE
          kind-apollo11           kind-apollo11           kind-apollo11           apollo-airlines
*         kind-apollo11-sandbox   kind-apollo11-sandbox   kind-apollo11-sandbox
```

### Step 2: Same command, different cluster, different answer

```bash
kubectl --context kind-apollo11         get deploy -A | wc -l     # Apollo's Deployments + CoreDNS + local-path
kubectl --context kind-apollo11-sandbox get deploy -A | wc -l     # only CoreDNS + local-path
kubectl --context kind-apollo11         get nodes                 # 3 nodes
kubectl --context kind-apollo11-sandbox get nodes                 # 1 node
```

- **`--context`** overrides `current-context` for one command and changes nothing in the file. It is the safest way to work with more than one cluster: the target is written in the command itself.
- **`--namespace` / `-n`** overrides the context's namespace the same way.

### Step 3: Practise changing things, on the sandbox

The sandbox is where the "changes things" half of [kubectl: zero to hero](./kubectl-zero-to-hero#7-preview-a-change-before-making-it) belongs. Break it freely.

```bash
kubectl config use-context kind-apollo11-sandbox
kubectl create namespace practice
kubectl config set-context --current --namespace=practice

kubectl create deployment web --image=nginx:1.27-alpine --replicas=2
kubectl rollout status deploy/web
kubectl scale deploy/web --replicas=4
kubectl set image deploy/web nginx=nginx:1.27-does-not-exist     # a stalled rollout, like Stage 1 Step 8
kubectl get rs,pods
kubectl rollout undo deploy/web
kubectl label pod "$(kubectl get pod -l app=web -o name | head -1 | cut -d/ -f2)" app=detached --overwrite
kubectl get pods -L app                                          # the ReplicaSet made a replacement; the detached Pod lives on
```

- **What the last two lines show:** a ReplicaSet owns Pods *by label*. Relabel one and the ReplicaSet stops counting it, creates a new one, and the old Pod keeps running unowned. On Apollo this would quietly pull a booking Pod out of its Service. Here it costs nothing.

### Step 4: Switch back, and set the namespace per context

```bash
kubectl config use-context kind-apollo11
kubectl get pods                      # apollo-airlines Pods, because this context's namespace is apollo-airlines
kubectl config get-contexts
```

- **The namespace belongs to the context.** `apollo11` remembers `apollo-airlines`; the sandbox remembers `practice`. Switching context switches both.
- **`use-context`** edits the file. Every terminal and every tool sees the change, including a k9s session you left open elsewhere.

### Step 5: Keep clusters in separate files (optional)

`KUBECONFIG` can point at a different file, or at several files merged together:

```bash
kind get kubeconfig --name apollo11-sandbox > ~/.kube/apollo11-sandbox.yaml

KUBECONFIG=~/.kube/apollo11-sandbox.yaml kubectl config get-contexts              # only the sandbox
KUBECONFIG=~/.kube/config:~/.kube/apollo11-sandbox.yaml kubectl config get-contexts  # merged view
```

- **Merging rules:** files are read left to right; the first file that sets a name wins, and `current-context` comes from the first file that sets it. Writes (`use-context`) go to the first file.
- **Why teams do this:** one file per cluster, and `export KUBECONFIG=…` per terminal, means a terminal opened for production *only knows* production. A shared `~/.kube/config` with ten contexts relies on you checking every time.

## Habits that prevent the wrong-cluster accident

| Habit | How |
|---|---|
| See the context all the time | Put it in your prompt: `PS1='[$(kubectl config current-context 2>/dev/null)] \w \$ '`, or use [kube-ps1](https://github.com/jonmosco/kube-ps1). [k9s](./k9s) shows it in its header; [Headlamp](./headlamp) in the cluster selector |
| Name the target in risky commands | `kubectl --context kind-apollo11 delete …`, never a bare `delete` after a switch |
| Guard scripts | Copy the Stage 1 pattern: read the context once, refuse anything unexpected, pass `--context` to every call |
| Re-check after creating clusters or fetching credentials | `kind create`, `eks update-kubeconfig` and friends switch context for you |
| Faster switching (optional) | [kubectx / kubens](https://github.com/ahmetb/kubectx): `kubectx kind-apollo11`, `kubens apollo-airlines`, `kubectx -` for "previous" |

## Try it

```bash
bash stages/stage1/scripts/teardown.sh kind-apollo11-sandbox    # ask the Stage 1 teardown to run on the sandbox
```

```text
Refusing context kind-apollo11-sandbox; Stage 1 only owns kind-apollo11 or kind-apollo11-dev.
```

That refusal is the whole page in one line: a destructive script names the clusters it may touch, and anything else is an error rather than a surprise.

## Common misconceptions

| Wrong belief | Why it's tempting | Correction |
|---|---|---|
| "A context is a cluster" | kind names them the same | A context is cluster **+ user + namespace**. Two contexts can share a cluster |
| "`-n` is remembered between commands" | The context's namespace *is* remembered | `-n` affects one command only. `set-context --namespace` is what persists |
| "Switching context in one terminal only affects that terminal" | Shell variables work that way | `use-context` edits the shared file. Use `--context` or a per-terminal `KUBECONFIG` for isolation |
| "Deleting a kind cluster leaves my kubeconfig messy" | Other tools do leave stale entries | `kind delete cluster` removes its own cluster, user and context. Check `current-context` afterwards, though |

## Clean up

Keep the sandbox for now: the [k9s](./k9s) and [Headlamp](./headlamp) tutorials use it to show context switching. Remove it when you finish the flight deck:

```bash
kind delete cluster --name apollo11-sandbox
rm -f ~/.kube/apollo11-sandbox.yaml
kubectl config get-contexts
kubectl config current-context        # if empty or wrong:
kubectl config use-context kind-apollo11
```

- If the sandbox was the current context when you deleted it, kind removes it and leaves `current-context` empty. Commands then fail with `current-context is not set`. `use-context` fixes it.

## Check yourself

<details>
<summary>You ran `kind create cluster --name scratch` in one terminal. In another terminal you run `bash stages/stage1/scripts/teardown.sh`. What happens?</summary>

`kind create` switched `current-context` to `kind-scratch` in the shared kubeconfig, so the second terminal is now pointed at `scratch` too. `teardown.sh` reads that context and refuses. A script without the guard would have run its `delete namespace` against `scratch`. Here that is harmless; between staging and production it is an outage.
</details>

<details>
<summary>How do you run one command against the sandbox without touching `current-context`?</summary>

`kubectl --context kind-apollo11-sandbox <command>`, or `KUBECONFIG=~/.kube/apollo11-sandbox.yaml kubectl <command>`.
</details>

**Next:** [k9s](./k9s) and [Headlamp](./headlamp) read this same kubeconfig. Both let you switch between `kind-apollo11` and `kind-apollo11-sandbox`, and both show you which one you are on.
