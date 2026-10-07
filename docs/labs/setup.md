---
title: "Prepare Your Launchpad"
---

# Prepare your launchpad

:::info[Page type · optional lab setup]
Use this page only for the hands-on route. The required chapters do not depend
on a local Docker or Kubernetes environment.
:::

- Labs are disposable: dedicated Apollo11 clone, local `kind` cluster, tear down at the end.

## Tools

| Tool | Needed for |
|---|---|
| Git, Docker (+ Compose v2), curl | Launchpad onward |
| kind, kubectl, Helm, jq | Ignition onward |
| k6 | Stage 7 |
| Node 20+ / npm | Running this docs site only |

- Keep ~20 GB free disk and ~8 GB free RAM for Stages 6–7.
- Windows: use WSL2 consistently.

```bash
git --version && docker --version && docker compose version && docker ps
kind version && kubectl version --client && helm version && jq --version && k6 version
```

- Each should print a version; `docker ps` must not show a daemon error.

## Prepare the verified workspace

```bash
git clone https://github.com/darshan-raul/Apollo11.git
cd Apollo11
git checkout 69113dcc80f77e32301d8ee7b9e73a67c923de96
git status --short       # expect empty
git rev-parse HEAD       # expect 69113dcc80f77e32301d8ee7b9e73a67c923de96
```

- A detached-HEAD message is expected.
- Different revision? Paths, namespaces and output will differ. Record the hash with your results.
- Run every lab from the repo root.

## Know the stage boundary

- Each stage is a snapshot, not a patch on the previous one. Confirm directory, cluster and namespace before each lab.

| Part of journey | Primary application namespace | Extra namespaces |
| --- | --- | --- |
| Launchpad | Docker Compose; no namespace | None |
| Ignition | `default` (no namespace flag) | `kube-system` |
| Stage 1 (Liftoff) | `apollo-airlines` | `kube-system` |
| Networking onward (Stages 2–5) | `apollo-airlines-apps` | `apollo-airlines-ui`; stage-specific system namespaces |
| Observability (Stage 6) | `apollo-airlines-apps` | `apollo-observability`, `apollo-airlines-ui` |
| Scaling (Stage 7) | `apollo-airlines-apps` | `apollo-observability`, `apollo-airlines-ui` |

- The stage page wins if it names a more specific boundary.

## The learner-work directory

- Author your own manifests here instead of only applying repo files.
- `learner-work/` is git-ignored in Apollo11. Checked-in `stages/<stage>/k8s/` files are the reference solutions.

```bash
mkdir -p learner-work/ignition learner-work/stage1
```

## Run the first preflight

```bash
kind get clusters
kubectl config current-context
docker ps
docker ps --format '{{.Ports}}' | grep -E '3000|8080|8081|8082|8083|8084' || true
```

- No clusters listed is fine. An old `apollo11` cluster: inspect it or delete it deliberately.
- Last command prints nothing: Launchpad ports are free. Output means something holds them. Identify it before stopping it.
- `apply` success = API accepted the objects. It says nothing about scheduling, endpoints, telemetry or bookings.

## Order of labs

- [Launchpad](../launchpad) (Docker Compose) → [Ignition](../ignition) (kind) → Stages 1–7.
- Each stage names its own start state and cleanup. Do not mix commands across snapshots.

## When a command fails

Check in order:

1. `git rev-parse HEAD` is the pinned hash.
2. `pwd` is the repo / stage directory the lab names.
3. `kubectl config current-context` is `kind-apollo11`.
4. `kubectl get namespaces` shows the stage's namespace.
5. The exercise's own troubleshooting note.

| Symptom | Usually |
|---|---|
| `NotFound` | Wrong stage or namespace |
| `connection refused` | Wrong address, or listener not ready |
| `Pending`, timeouts | Read events and conditions; do not re-apply blindly |

More: [Troubleshooting](../troubleshooting).

## Revision and verification boundary

- Verified revision: `69113dcc80f77e32301d8ee7b9e73a67c923de96`. Includes runtime-owned certificates, HTTPS frontend API URLs, token automount protections, promtool-verified SLO rules and the repeatable k6 cache benchmark. No patches needed.
- Before each stage: `git rev-parse HEAD` matches and `git status --short` is clean.
