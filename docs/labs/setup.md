---
title: "Prepare Your Launchpad"
---

# Prepare your launchpad

:::info[Page type · optional lab setup]
Use this page only for the hands-on route. The required chapters do not depend
on a local Docker or Kubernetes environment.
:::

The labs are disposable: use a dedicated Apollo11 clone and a local kind
cluster, record what you observe, and tear the environment down when the
mission ends.

## Bring these tools aboard

Install Git and Docker with the Compose v2 plugin for Launchpad. Ignition and
later labs also use kind, kubectl, Helm, curl, and jq. Stage 7 uses k6. Node.js
20 or later and npm are needed only to run this documentation site locally.
Docker must be running before kind can create a cluster. Keep roughly 20 GB of
free disk and 8 GB of available memory for the observability and scaling labs.

```bash
git --version
docker --version
docker compose version
docker ps
kind version
kubectl version --client
helm version
curl --version
jq --version
k6 version
```

The commands should print versions; `docker ps` should return a table without a
daemon connection error. If a tool is missing, install it from its official
documentation and repeat that check. Windows learners should run the labs
consistently inside WSL2 rather than mixing Windows and Linux paths.

## Clone the tested lab revision

These docs are paired with Apollo11 commit
`7b693c9bae0a789dc9db8e0628c478fd0dd53e88`. Use a dedicated clone so checking
out the tested revision cannot overwrite unrelated work:

```bash
git clone https://github.com/darshan-raul/Apollo11.git
cd Apollo11
git checkout 7b693c9bae0a789dc9db8e0628c478fd0dd53e88
git status --short
git rev-parse HEAD
```

`git status --short` should print nothing and `git rev-parse HEAD` should print
the commit above. A detached `HEAD` message is expected: this clone is a stable
lab workspace, not a development branch. If you intentionally use another
revision, record its hash with your results and expect paths, namespaces, and
output to differ.

Run each lab from that repository root. The documentation explains the
mechanisms; the pinned application repository supplies the runnable manifests,
scripts, and image tags.

## Know the stage boundary

Each stage is a snapshot, not an in-place patch that automatically preserves
every earlier control. Before a lab, confirm the named directory, cluster, and
namespace.

| Part of journey | Primary application namespace | Extra namespaces |
| --- | --- | --- |
| Launchpad | Docker Compose; no namespace | None |
| Ignition and early workloads | `apollo-airlines` | `kube-system` |
| Networking onward | `apollo-airlines-apps` | `apollo-airlines-ui`; stage-specific system namespaces |
| Observability | `apollo-airlines-apps` | `apollo-observability` |

Treat the stage page as authoritative when it gives a more specific boundary.
Do not replace a namespace merely because another stage used a different one.

## Run the first preflight

```bash
kind get clusters
kubectl config current-context
docker ps
docker ps --format '{{.Ports}}' | grep -E '3000|8080|8081|8082|8083|8084' || true
```

It is fine for `kind get clusters` to report no clusters. Do not reuse an old
`apollo11` cluster by accident: inspect its context and state or remove it
intentionally. No output from the last command means Docker is not publishing
Launchpad's ports. Output is a prompt to identify and intentionally stop the
conflict, not permission to kill an unknown process.

An apply command means the API accepted requested objects. It does not yet mean
their Pods are scheduled, endpoints are ready, telemetry is collecting, or a
passenger can complete a booking.

## Start when the mission calls for it

The [Launchpad lab](../launchpad) uses Docker Compose before Kubernetes joins
the story. Move to [Ignition](../ignition) when you want a local cluster. Each
later stage names its own starting state and cleanup boundary; do not mix
commands from different snapshots.

## When a command fails

Check these in order before changing the cluster:

1. `git rev-parse HEAD` — are you on the tested Apollo11 revision?
2. `pwd` — are you in the repository and stage directory named by the lab?
3. `kubectl config current-context` — are you on the disposable kind cluster?
4. `kubectl get namespaces` — does the stage's namespace exist?
5. the lab's expected result and troubleshooting branch.

`NotFound` often means wrong stage or namespace. `connection refused` often
means the client has the wrong address or the listener is not ready. `Pending`
and timeouts require events and conditions, not repeated blind apply commands.
Use the [Troubleshooting Bible](../troubleshooting) when these checks do not
explain the failure.
