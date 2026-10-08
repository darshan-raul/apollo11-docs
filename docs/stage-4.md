---
title: "Stage 4 — Flight Control: Reliability, Lifecycle & Governance"
description: "Give every Apollo workload a clear contract with Kubernetes: three probes, a graceful shutdown, resource requests and limits, priority, spreading and disruption budgets, and understand what each one improves over Stage 3."
sidebar_label: "Stage 4: Flight Control (Reliability)"
---

# Stage 4: Flight Control

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage4`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage4) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: [Stage 3](./stage-3) (StatefulSets, PVCs, Envoy Gateway on MetalLB). Namespaces: `apollo-airlines-apps` and `apollo-airlines-ui`.
- Concepts behind this stage: [Probes](./learn/reliability/probes) · [Termination and draining](./learn/reliability/termination-and-draining) · [Requests, limits and pressure](./learn/reliability/requests-limits-and-pressure) · [Scheduling and placement](./learn/reliability/scheduling) · [Disruption budgets](./learn/reliability/disruption-budgets)
:::

## Where we left off

- **Stage 3** gave the databases stable names and volumes that survive Pod restarts. Apollo now keeps its data.
- But the cluster still knows very little about how each workload behaves. Four gaps remain:
  - **Probes are basic.** Liveness hits `/healthz`, which always answers 200. Readiness hits `/readyz`. For booking, `/readyz` checks its database **and** identity, flight and notification. If notification has a blip, every booking Pod is marked unready, even though bookings would still work.
  - **No requests or limits.** No container says how much CPU or memory it needs. The scheduler places Pods as if they cost nothing, and every Pod is `BestEffort`: first in line to be evicted when a node runs short.
  - **Shutdown is abrupt.** The Go services call `r.Run()` and never handle SIGTERM. A Pod being replaced stops at once, and requests still in flight fail. Routing may also still send new requests to it for a moment.
  - **Nothing protects planned maintenance.** A `kubectl drain` can evict both booking Pods at the same time. All replicas could also land on one node.

Stage 4 changes no features. It changes how every workload is described to Kubernetes, so the kubelet and scheduler stop guessing.

## What changes in this stage

| Concern | Stage 3 | Stage 4 | Why it's better |
|---|---|---|---|
| "Is it still starting?" | Nothing; liveness waits a fixed `initialDelaySeconds: 10` | **`startupProbe`** `/healthz/startup`, 6 × 5 s = 30 s budget | Liveness and readiness wait until start-up is done, however long it takes within the budget |
| "Is the process stuck?" | Liveness `/healthz` | **`livenessProbe`** `/healthz/live`, 3 failures | Restarts only a container that has stopped answering |
| "Can it serve traffic?" | Readiness `/readyz` (booking: DB + 3 services) | **`readinessProbe`** `/healthz/ready` (own DB or Redis only) | A neighbour's outage no longer removes healthy Pods from the Service |
| Shutdown | SIGTERM kills the process | **`preStop: sleep 5`**, then the app drains (`srv.Shutdown`, 30 s); `terminationGracePeriodSeconds` 30 (apps) / 60 (data) | Routing has time to forget the Pod before it stops accepting requests |
| CPU and memory | Not set; `BestEffort` | **`requests == limits`** on all 10 workloads; `Guaranteed` | The scheduler places Pods on real numbers; Apollo Pods are last to be evicted |
| Importance | All equal | **PriorityClasses**: booking and search critical, notification low | When room is short, the scheduler knows what to keep |
| Placement | Wherever the scheduler likes | **`topologySpreadConstraints`** `maxSkew: 1` per node | Replicas prefer different nodes, so one node loss doesn't take a service down |
| Planned maintenance | Unprotected | **PodDisruptionBudgets** `booking-pdb`, `frontend-pdb` (`minAvailable: 1`) | A drain can never evict the last ready booking or frontend Pod |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `k8s/apps/<service>/<service>-dep.yaml` | Six Deployments with three probes, `preStop`, grace period, resources, spread, priority | Replaces Stage 3's versions of the same files |
| `k8s/apps/<db>/<db>-sts.yaml` | Four StatefulSets, now with resources and a 60 s grace period | Replaces Stage 3's versions |
| `k8s/config/priorityclass.yaml` | `apollo-airlines-app-critical` (1000000) and `apollo-airlines-app-low` (-100000) | New, cluster-scoped |
| `k8s/pdb/booking-pdb.yaml`, `frontend-pdb.yaml` | `minAvailable: 1` for booking and frontend | New |
| `code/<service>/` | Same apps, plus `/healthz/{startup,live,ready}` and SIGTERM handling | Replaces Stage 3 code; old `/healthz` and `/readyz` still answer |
| `k8s/gateway/`, `k8s/metallb/`, `k8s/jobs/`, `k8s/config/` (rest) | Envoy Gateway, MetalLB, seed Jobs, namespaces, ConfigMap, Secret, 13 ServiceAccounts | Carried over from Stage 3 |
| `scripts/apply.sh` | 8 phases: build, config + PriorityClasses, workloads + PDBs, waits, Jobs, MetalLB, Gateway | Replaces Stage 3's script |
| `scripts/verify.sh`, `teardown.sh` | Full check (including an eviction test), and clean removal (also deletes the PriorityClasses) | — |

## Walkthrough

### Step 1: Apply

```bash
kubectl config current-context        # must be kind-apollo11
bash stages/stage4/scripts/apply.sh   # add --skip-build to reuse loaded images
```

- **What happens:** the script rebuilds the six images (the code changed), applies config and the two PriorityClasses, then workloads and PDBs, waits for the StatefulSets and Deployments, runs the seed Jobs, and finally sets up MetalLB and Envoy Gateway. It prints the Gateway IP at the end.
- **Object names are the same as Stage 3.** On a running Stage 3 the apply becomes a rolling update. For a clean start, run `bash stages/stage3/scripts/teardown.sh` first.
- **Why PriorityClasses go first:** a Pod that names a PriorityClass that doesn't exist is rejected. Config always comes before the things that refer to it, as in Stage 1.

### Step 2: Read the three probes on booking

Open [`k8s/apps/booking/booking-dep.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage4/k8s/apps/booking/booking-dep.yaml):

```yaml
# booking-dep.yaml (container, trimmed)
startupProbe:
  httpGet: {path: /healthz/startup, port: 8082}
  periodSeconds: 5
  failureThreshold: 6          # 6 × 5 s = up to 30 s to start
livenessProbe:
  httpGet: {path: /healthz/live, port: 8082}
  initialDelaySeconds: 15
  periodSeconds: 10
  failureThreshold: 3          # 3 misses in a row → kubelet restarts the container
readinessProbe:
  httpGet: {path: /healthz/ready, port: 8082}
  periodSeconds: 5
  failureThreshold: 3          # 3 misses → removed from the Service, not restarted
```

And the handler behind readiness, in [`code/booking/main.go`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage4/code/booking/main.go):

```go
r.GET("/healthz/ready", func(c *gin.Context) {
    if err := db.Ping(); err != nil {          // only booking's own database
        c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "detail": "DB not reachable"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"status": "ready"})
})
```

- **A probe** is a check the kubelet runs against a container on a timer. Each of the three asks a different question and gets a different reaction:
  - **Startup:** "has it finished starting?" Until it passes, the other two probes don't run. If the 30 s budget runs out, the container is restarted.
  - **Liveness:** "is the process still answering?" `/healthz/live` always returns 200 if the server can respond at all. Fail it and the kubelet **restarts** the container.
  - **Readiness:** "should it get traffic right now?" Fail it and the Pod is **removed from the Service's endpoints**. Nothing restarts.
- **Why readiness checks only the database:** in Stage 3, booking's `/readyz` also called identity, flight and notification. One slow neighbour made every booking Pod unready, and the outage spread. Now each service checks only what it needs to answer at all: flight, identity and booking their database, notification its Redis. Search and frontend have nothing to check and always answer ready.
- **Compared with Stage 3:** liveness used to wait a fixed 10 s and then start counting. A slow start meant restarts that fixed nothing. The startup probe replaces that guess with a budget.
- **Databases are different:** the StatefulSets keep their `pg_isready` and `redis-cli ping` exec probes, with no startup probe. Postgres doesn't accept connections until `initdb` finishes, so `pg_isready` already acts as a start-up check.

### Step 3: See readiness and liveness do different things

Stop booking's database (the PVC is kept), then look at booking:

```bash
NS=apollo-airlines-apps
GW=$(kubectl get gateway apollo-gateway -n $NS -o jsonpath='{.status.addresses[0].value}')

kubectl scale sts/booking-db -n $NS --replicas=0
sleep 20
kubectl get pods -n $NS -l app=booking                              # 0/1 Running, RESTARTS 0
kubectl exec -n $NS deploy/booking -- wget -qO- http://127.0.0.1:8082/healthz/live    # alive
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: booking.apollo.local" http://$GW/healthz/ready   # 503

kubectl scale sts/booking-db -n $NS --replicas=1
kubectl wait --for=condition=Ready pod/booking-db-0 -n $NS --timeout=120s
kubectl get pods -n $NS -l app=booking -w                           # back to 1/1, still RESTARTS 0
```

- **What you see:** booking is alive but not ready. It is taken out of the Service, so the Gateway has nowhere to send the request and returns `503`. It is not restarted, because restarting booking would not bring its database back.
- **When the database returns,** readiness passes again and the Pods rejoin the Service on their own. The earlier bookings are still there: that is Stage 3's PVC.
- **How to read this pattern:** live OK + ready failing + `RESTARTS 0` means the process is fine and a dependency is not. Restarts climbing means liveness or start-up is failing: look at the process itself.

### Step 4: See the graceful shutdown

```yaml
# booking-dep.yaml (trimmed)
terminationGracePeriodSeconds: 30     # hard deadline: SIGKILL after 30 s
containers:
  - lifecycle:
      preStop:
        exec: {command: ["/bin/sh", "-c", "sleep 5"]}   # runs before SIGTERM is sent
```

```go
// code/booking/main.go (trimmed): the app now handles SIGTERM
signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
<-quit
logJSON("INFO", "booking-service", "Received SIGTERM, shutting down gracefully", "", "", nil)
shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
srv.Shutdown(shutdownCtx)          // stop accepting, finish in-flight requests
db.Close()
```

Watch it happen:

```bash
NS=apollo-airlines-apps
P=$(kubectl get pod -n $NS -l app=booking -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n $NS $P -f --timestamps &
kubectl delete pod -n $NS $P --wait=false
sleep 12; kill %1
```

- **What happens, in order:** the Pod is marked `Terminating`. Two things then start at the same time: the endpoint controller removes it from the Service, and the kubelet runs `preStop`. After the 5 s sleep the app gets SIGTERM, logs `Received SIGTERM, shutting down gracefully`, finishes open requests and closes its database connection.
- **Why the 5 s sleep:** removing a Pod from the Service has to reach kube-proxy and Envoy on every node. That takes a moment. Without the sleep the app could stop listening while traffic is still being routed to it. The sleep gives routing a head start. It narrows the gap; it can't prove zero failures.
- **Why the grace period:** if the app ignores SIGTERM, the kubelet waits the whole grace period and then kills it (exit code 137). Apps get 30 s, the same as their own drain timeout. Postgres and Redis get 60 s to checkpoint and flush to disk.
- **Compared with Stage 3:** SIGTERM ended the process at once, and nothing delayed it. Each rolling update and each drain could drop a few requests.
- **identity** is Python: uvicorn runs with `timeout_graceful_shutdown=30` and logs the same SIGTERM message.

### Step 5: See requests, limits and QoS

```yaml
# booking-dep.yaml
resources:
  requests: {cpu: 200m, memory: 256Mi}   # what the scheduler reserves on a node
  limits:   {cpu: 200m, memory: 256Mi}   # the most the container may use
```

| Tier | Workloads | CPU | Memory |
|---|---|---|---|
| Default | identity, flight, search | 100m | 128Mi |
| Flagship | booking | 200m | 256Mi |
| Low | notification | 50m | 64Mi |
| UI | frontend | 50m | 64Mi |
| Postgres | identity-db, flight-db, booking-db | 200m | 256Mi |
| Redis | redis | 100m | 128Mi |

```bash
kubectl get pods -n apollo-airlines-apps -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl describe node apollo11-worker | sed -n '/Allocated resources/,/Events/p'
```

- **Requests** are a reservation. The scheduler only puts a Pod on a node whose unreserved capacity covers its requests. It looks at requests, not at what the Pod actually uses.
- **Limits** are a ceiling. Going over the CPU limit slows the container down. Going over the memory limit kills it (`OOMKilled`).
- **QoS class** (quality of service) is a label Kubernetes derives from those numbers. `requests == limits` for CPU and memory gives `Guaranteed`. Requests lower than limits gives `Burstable`. Nothing set gives `BestEffort`. When a node runs short of memory, the kubelet evicts `BestEffort` first and `Guaranteed` last.
- **Compared with Stage 3:** every Pod was `BestEffort`, and the "Allocated resources" section of a node showed almost nothing requested. Now it shows what Apollo has reserved.
- **Why booking gets double:** it calls flight, identity and notification on every request, so it is the busiest service.
- **The trade-off:** `Guaranteed` means a Pod can't borrow idle CPU above its limit. Stage 7 measures real usage before changing these numbers.

### Step 6: See priority and spreading

```yaml
# booking-dep.yaml (Pod spec, trimmed)
priorityClassName: apollo-airlines-app-critical   # value 1000000
topologySpreadConstraints:
  - maxSkew: 1                          # replica counts per node may differ by at most 1
    topologyKey: kubernetes.io/hostname # "one node" is the unit
    whenUnsatisfiable: ScheduleAnyway   # a preference, not a hard rule
    labelSelector: {matchLabels: {app: booking}}
```

```bash
kubectl get priorityclass
kubectl get pods -n apollo-airlines-apps -l app=booking \
  -o custom-columns=NAME:.metadata.name,PRIORITY:.spec.priority,CLASS:.spec.priorityClassName,NODE:.spec.nodeName
```

- **Priority:** booking and search use `apollo-airlines-app-critical`; notification uses `apollo-airlines-app-low` (-100000). The others use the default (0). If a critical Pod can't fit anywhere, the scheduler may evict lower-priority Pods to make room. Losing a notification is better than losing booking.
- **Spreading:** the two booking Pods normally sit on `apollo11-worker` and `apollo11-worker2`. If one node is lost, the other copy keeps serving.
- **Why `ScheduleAnyway`:** with `DoNotSchedule`, a full node would leave the Pod `Pending`. Here a lopsided placement is better than a missing replica.
- **Compared with Stage 3:** both booking Pods could end up on the same node, and nothing ranked one workload above another.

### Step 7: See what a PodDisruptionBudget allows

```yaml
# k8s/pdb/booking-pdb.yaml
kind: PodDisruptionBudget
spec:
  minAvailable: 1                       # keep at least one ready booking Pod
  selector: {matchLabels: {app: booking}}
```

```bash
NS=apollo-airlines-apps
kubectl get pdb -A                      # booking-pdb and frontend-pdb, ALLOWED DISRUPTIONS 1
evict() { kubectl create --raw "/api/v1/namespaces/$NS/pods/$1/eviction" -f - <<JSON
{"apiVersion":"policy/v1","kind":"Eviction","metadata":{"name":"$1","namespace":"$NS"}}
JSON
}
PODS=($(kubectl get pod -n $NS -l app=booking -o jsonpath='{.items[*].metadata.name}'))
evict ${PODS[0]}     # allowed
evict ${PODS[1]}     # refused: "Cannot evict pod as it would violate the pod disruption budget"
kubectl rollout status deploy/booking -n $NS
kubectl get pdb booking-pdb -n $NS      # ALLOWED DISRUPTIONS back to 1
```

- **A voluntary disruption** is a Pod removal someone planned: `kubectl drain`, a cluster upgrade, an autoscaler removing a node. These go through the **Eviction API**, and the Eviction API checks PDBs.
- **What you see:** the first eviction succeeds. The second is refused (HTTP 429) until the replacement is Ready. Traffic through the Gateway keeps flowing, because one booking Pod is always ready.
- **What a PDB does not stop:** `kubectl delete pod`, scaling down, a node crash, an OOM kill. None of these use the Eviction API. A PDB is a rule for planned maintenance, not a promise of uptime.
- **Why only booking and frontend:** they are the services passengers notice first. Stage 5 makes PDBs a per-environment choice.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| `0/1 Running`, `RESTARTS 0` | Readiness failing: its own DB or Redis is unreachable | `kubectl exec deploy/<svc> -- wget -qO- http://127.0.0.1:<port>/healthz/ready` |
| Restarts climbing, `Liveness probe failed` events | Process hung, or liveness too strict | `kubectl describe pod <pod>` → Events; `kubectl logs <pod> --previous` |
| Restarts during start-up, `Startup probe failed` | Start-up took longer than 30 s | `kubectl describe pod <pod>`; compare with `periodSeconds × failureThreshold` |
| `Pending`, `FailedScheduling … Insufficient cpu/memory` | Requests don't fit on any node | `kubectl describe node <node>` → Allocated resources |
| `OOMKilled`, exit code 137 | Container used more than its memory limit | `kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'` |
| Pod takes exactly its grace period to stop | App ignores SIGTERM, killed by SIGKILL | `kubectl logs <pod>` for the SIGTERM line |
| `kubectl drain` hangs | A PDB allows 0 disruptions (too few ready replicas) | `kubectl get pdb -A` |
| Pod rejected: PriorityClass not found | `config/` not applied first | `kubectl get priorityclass` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| 53 YAML files applied by a script; tiers and probe settings copied into every file | One change means editing many files; no environments; no release history or rollback | [Stage 5](./stage-5): Helm, Kustomize, Argo CD |
| Probes say "up or down", nothing more | No latency, error rate or traces; you only find out when readiness fails | [Stage 6](./stage-6): metrics, logs, traces |
| Requests and limits are educated guesses; replica counts are fixed | Too low throttles, too high wastes; traffic peaks get the same two Pods | [Stage 7](./stage-7): measurement, HPA, VPA |
| Secret still base64 in Git; no RBAC, no security context | Anyone with repo access has the password | [Stage 8](./stage-8) (planned): Vault, RBAC, policy |
| Databases have one replica and node-local storage | A drain of that node leaves the DB `Pending`; a PDB can't make storage portable | [Stage 9](./stage-9) (planned): EKS with dynamic cloud storage |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | Stage 3 | **Stage 4** |
|---|---|---|---|---|---|---|
| Runs on | One Docker host | Three-node kind cluster | Same cluster | Same cluster | Same cluster | Same cluster |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment | Deployment (apps) + StatefulSet (data) | Same |
| Recovery | `restart:` on one host | None | ReplicaSet replaces Pods | Same | + StatefulSet keeps name and volume | **+ liveness restarts hung containers; PDBs limit planned evictions** |
| Service discovery | Docker DNS | Pod IP only | Service + cluster DNS | Same, across two namespaces | + headless Services for the databases | Same |
| Entry point | `ports:` | `kubectl port-forward` | NodePort | Envoy Gateway on a MetalLB IP, hostnames, TLS | Same | Same |
| Config / secrets | `environment:` | Inline in `pod.yaml` | ConfigMap / Secret | Same | Same | Same |
| Data | Named volume | — | `emptyDir` (ephemeral) | `emptyDir` | PVC per database (local-path) | Same, **+ 60 s for a clean shutdown** |
| Health checks | Compose `healthcheck:` | None | `/healthz` + `/readyz` | Same | Same | **Startup, liveness, readiness on separate paths** |
| Resources | Not set | Not set | Not set | Not set | Not set | **`requests == limits`, `Guaranteed`; priority; spreading** |
| Shutdown | Container stop | — | Immediate | Immediate | Immediate | **`preStop` + SIGTERM drain** |
| How it's deployed | `docker compose up` | `kubectl apply -f pod.yaml` | `apply.sh` | `apply.sh --substage N` | `apply.sh` | `apply.sh` |

## Clean up

```bash
bash stages/stage4/scripts/verify.sh      # optional: the full automated check
bash stages/stage4/scripts/teardown.sh
kubectl get ns apollo-airlines-apps apollo-airlines-ui   # NotFound
kubectl get priorityclass | grep apollo || echo "PriorityClasses removed"
```

- Teardown deletes the namespaces (including the PVCs, so the data goes too), the Gateway, MetalLB and the PriorityClasses. The kind cluster stays for Stage 5.

## You should now be able to explain

- What the kubelet does when each of the three probes fails, and why only one of them restarts the container.
- Why booking's readiness now checks only its own database, and what went wrong when it checked its neighbours too.
- Why a Pod being replaced needs both a `preStop` delay and SIGTERM handling in the app.
- How requests drive scheduling, how limits are enforced, and what makes a Pod `Guaranteed`.
- What priority and topology spreading decide, and why the spread is only a preference here.
- Which disruptions a PDB blocks, and which it never sees.

**Next:** [Stage 5: Payload Integration](./stage-5) replaces 53 hand-applied YAML files with a versioned Helm chart, environment overlays and GitOps.
