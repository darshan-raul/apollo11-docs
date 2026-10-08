---
title: "Apollo11 Core Capstone"
description: "Run the finished Stage 7 platform and follow one booking through every layer, naming which stage added each layer and what it replaced."
sidebar_label: "Core Capstone"
---

# Capstone: the whole platform, one booking

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage7`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: everything from Launchpad to Stage 7. Security and cloud are still *planned* (Stages 8–9).
- Read first: [A passenger's booking](./learn/capstone/a-booking-through-kubernetes), the chapter version of this page.
:::

## Where we are

- Seven stages each added one layer, and each layer exists because the one before it ran out of road.
- This page adds nothing new. It runs the finished platform once and follows **one booking** through it. At every hop you'll see:
  - which object handles the hop,
  - which stage introduced it,
  - and what it replaced.

## Bring up the finished platform

```bash
kind get clusters | grep -qx apollo11 || kind create cluster --config stages/ignition/kind-config.yaml
kubectl config use-context kind-apollo11
bash stages/stage7/scripts/apply.sh --mode helm --env dev
bash stages/stage7/scripts/verify.sh --mode helm --env dev
```

- **What happens:** Helm (Stage 5) installs the chart with the dev values: one replica per app, HPA from 1 to 3, no PDBs. The observability stack (Stage 6) and the scaling pieces (Stage 7) come with it.
- **Why Helm, not raw YAML and a script like Stage 1:** the same chart serves dev, staging and prod, with only the values changing, and every install is a numbered release you can roll back.

## Follow one booking

```bash
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
TOKEN=$(curl -s -H "Host: identity.apollo.local" -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' http://$GW/api/users/login | jq -r .token)
curl -s -w '\n%{http_code}\n' -X POST -H "Host: booking.apollo.local" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' http://$GW/api/bookings
bash stages/stage7/scripts/trace-test.sh      # prints trace_id=… services=…
```

Expect `201`. Cancel afterwards with `DELETE /api/bookings/<id>` to give the seat back.

| # | Hop | Handled by | Added in | Replaced | See it |
|---|---|---|---|---|---|
| 1 | Laptop → cluster | MetalLB address on the **Gateway** | Stage 2 | One NodePort per service (Stage 1) | `kubectl get gateway apollo-gateway -n apollo-airlines-apps` |
| 2 | Host header → service | **HTTPRoute** `booking` | Stage 2 | Ingress rules (earlier in Stage 2) | `kubectl get httproute -n apollo-airlines-apps` |
| 3 | Route → a healthy Pod | **Service** + EndpointSlice, *Ready* Pods only | Stage 1; readiness sharpened in Stage 4 | Docker DNS (Launchpad) | `kubectl get endpointslice -n apollo-airlines-apps -l kubernetes.io/service-name=booking` |
| 4 | Booking checks the token and reads the flight | Cluster DNS names `identity`, `flight` | Stage 1; cross-namespace in Stage 2 | Compose service names | trace: `booking → identity`, `booking → flight` |
| 5 | Flight read served fast | **Redis cache-aside** | Stage 7 | A Postgres query on every read | `trace-test.sh` services list; cache metrics |
| 6 | Booking row written and kept | **StatefulSet** `booking-db` + **PVC** | Stage 3 | `emptyDir` (Stage 1), lost on Pod replacement | `kubectl get sts,pvc -n apollo-airlines-apps` |
| 7 | Confirmation sent | `notification`, called after the write | Stage 1 | — | trace: the notification span comes after the DB write |
| 8 | Enough booking Pods for the load | **HPA** on CPU, using Stage 4's requests | Stage 7 | Fixed `replicas:` | `kubectl get hpa -n apollo-airlines-apps` |
| 9 | Proof it all happened | Prometheus metric, Loki log, Tempo trace sharing one ID | Stage 6 | `kubectl logs` on one Pod at a time | Grafana → Explore, search the `trace_id` |

- **Each layer leans on the one below:**
  - The Gateway (hop 1) can only route to Pods that the Service (hop 3) lists.
  - The Service only lists Pods that pass readiness (Stage 4).
  - The HPA (hop 8) can only scale on CPU *percent* because Stage 4 set CPU *requests*.
  - You only know any of it happened because of Stage 6.
- **Which calls make the passenger wait:** identity and flight are called before the response is built, so they add to the wait. Notification is called after the row is written and doesn't delay the response. In the trace, its span starts after the database work, off the critical path.

## What reacts when something breaks

| If this happens | What reacts | Added in | What the passenger sees |
|---|---|---|---|
| A booking Pod is deleted | The ReplicaSet creates a new one | Stage 1 | Nothing, if another replica is serving |
| The `booking-db` Pod is replaced | The StatefulSet recreates `booking-db-0`, which re-attaches the same PVC | Stage 3 | A short wait. The data is kept |
| Booking can't reach its database | Readiness fails, and the Pod leaves the endpoints without a restart | Stage 4 | `503` instead of a hung request |
| Booking hangs | Liveness fails, and the kubelet restarts the container | Stage 4 | A brief error, then recovery |
| A bad image is released | The rollout stalls and old Pods keep serving; then `helm rollback` to the last good revision | Stages 1 and 5 | Nothing |
| A node is drained | The PDB limits how many Pods leave at once (prod values; off in dev) | Stage 4 | Nothing, with 2+ replicas |
| Traffic doubles | The HPA adds Pods, and the cache absorbs repeated reads | Stage 7 | Steady latency |
| The error rate climbs | The SLO error budget burns on the dashboard | Stage 6 | Someone notices before passengers complain |

## Where the data lives, and what would still lose it

```bash
kubectl get pvc -n apollo-airlines-apps
kubectl get pv -o custom-columns=NAME:.metadata.name,CLAIM:.spec.claimRef.name,RECLAIM:.spec.persistentVolumeReclaimPolicy
```

- **What it shows:** each database has a claim, bound to a local-path volume on **one node**, with reclaim policy `Delete`.
- **What this protects against:** Pod replacement (Stage 3).
- **What it does not protect against:**
  - deleting the PVC (reclaim `Delete` removes the data),
  - losing the node (the volume is on that node's disk),
  - a bad migration or `DROP TABLE` (nothing to go back to).
- **What fixes those:** backups you have actually restored, plus replicated or network storage. That is [Stage 9](./stage-9) and the [EKS path](./eks).

## Production-shaped, not production-ready

```bash
kubectl get pods -n apollo-airlines-apps -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl get pdb -A
kubectl get networkpolicy -A
kubectl get deploy booking -n apollo-airlines-apps -o yaml | grep -E 'runAsNonRoot|readOnlyRootFilesystem|seccompProfile' || echo "no container hardening"
```

| Control | Today | Evidence | Comes in |
|---|---|---|---|
| Requests = limits (`Guaranteed` QoS) on the ten workloads | ✅ present | `qosClass` column | Stage 4 |
| PodDisruptionBudgets | Prod values only, none in dev | `get pdb -A` | Stage 4 |
| No API token in app Pods | ✅ present | `automountServiceAccountToken: false` | Stage 1 |
| Container hardening (non-root, read-only root, seccomp) | ❌ absent | no fields on booking | [Stage 8](./stage-8) (planned) |
| NetworkPolicy | ❌ absent | `No resources found` | Stage 8 (planned) |
| Secrets from a secret manager | ❌ plain Kubernetes Secrets | chart Secret template | Stage 8 (planned) |
| Admission policy | ❌ absent | — | Stage 8 (planned) |
| Backup and restore | ❌ absent | — | [Stage 9](./stage-9) (planned) |

- **Why this matters:** a control from one stage only exists later if the later stage carries it forward. A plan is not a control.

## The journey, end to end

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 | Stage 7 |
|---|---|---|---|---|---|---|---|---|---|
| Runs on | One Docker host | kind, 3 nodes | same | same | same | same | same | same | same |
| Deploy unit | Compose service | Bare Pod | **Deployment** | Deployment | **+ StatefulSet** | + probes, resources | **Helm release** | + observability stack | **+ HPA** |
| Entry point | `ports:` | port-forward | **NodePort** | **Ingress → Gateway API, TLS** | Gateway | Gateway | Gateway | Gateway | Gateway |
| Data | Named volume | — | `emptyDir` | `emptyDir` | **PVC per replica** | PVC | PVC | PVC | PVC **+ Redis cache** |
| Health checks | Compose healthcheck | — | basic probes | basic probes | basic probes | **startup / live / ready** | same | same | same |
| How it's shipped | `compose up` | `kubectl apply` | script + YAML | script + YAML | script + YAML | script + YAML | **Helm / Kustomize / Argo CD** | same | same |
| How we know it works | `docker logs` | `kubectl get` | `kubectl logs` | same | same | same | same | **metrics, logs, traces, SLO** | **+ load tests** |
| Capacity | fixed | fixed | fixed replicas | fixed | fixed | **requests / limits** | per-env values | measured | **HPA, VPA advice** |

## Clean up

```bash
bash stages/stage7/scripts/teardown.sh --mode helm --env dev --purge
kubectl get namespace apollo-airlines-apps apollo-airlines-ui apollo-observability   # all NotFound
```

## You should now be able to explain

- For each hop of a booking, which object handles it and which stage introduced it.
- Why later layers depend on earlier ones (HPA on requests, Gateway on endpoints, endpoints on readiness).
- Which controller reacts to each kind of failure, and what the passenger sees.
- What the PVCs protect against, and the three things that would still lose the data.
- Why this platform is production-*shaped* but not production-ready, using at least four rows of the controls table.

**Next:** [Stage 8: Command Module](./stage-8) (planned) adds security, and [Stage 9](./stage-9) (planned) moves to the cloud.
