---
title: "Stage 7 — Orbital Maneuvering: Autoscaling & Scheduling"
description: "Measure search first, then add a Redis cache, CPU-based HPA scaling and read-only VPA advice, and understand why each one needs what earlier stages built."
sidebar_label: "Stage 7: Orbital (Scaling)"
---

# Stage 7: Orbital Maneuvering

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage7`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: the Stage 6 chart, including its observability stack, on the `kind-apollo11` cluster (two workers needed for Step 6). Tear down Stage 6 first. Namespace for this stage's changes: `apollo-airlines-apps`. Step 3 needs [k6](https://grafana.com/docs/k6/latest/) installed.
- Concepts behind this stage: [Measurement before optimization](./learn/scaling/measurement-baseline) · [Cache-aside](./learn/scaling/cache-aside) · [Horizontal Pod Autoscaling](./learn/scaling/hpa) · [VPA and capacity planning](./learn/scaling/vpa-and-capacity) · [Requests, limits and pressure](./learn/reliability/requests-limits-and-pressure) · [Scheduling and placement](./learn/reliability/scheduling)
:::

## Where we left off

- **Stage 6** gave Apollo metrics, dashboards, a booking SLO, logs and traces. For the first time we can *measure*.
- The measurements show two problems:
  - **Search repeats the same work.** Every `/api/search` call becomes a call to flight, which queries flight-db. Ten passengers searching BOM → SIN for the same date cause ten identical database reads. In Prometheus, flight's `/api/flights` request rate tracks search's rate one-for-one. In Tempo, every search trace has a `search → flight` span.
  - **Replica counts are fixed.** Stage 5's values set them per environment: dev 1, staging 2, prod 3, whatever the traffic. At quiet times those Pods sit idle (the *Service Runtime* dashboard shows it). In a spike, the same number of Pods must take everything, and booking's p95 and error ratio are what suffer.
- One more gap: **Stage 4's CPU and memory requests were educated guesses** (search: 100m CPU, 128Mi). Nothing tells us whether they are right.
- And `kubectl top pods` returns an error: kind has no metrics-server, so Kubernetes itself has no CPU numbers for Pods.

Stage 7 fixes these in a fixed order: **measure first, then cache, then scale out, then get advice on sizing.**

## What changes in this stage

| Concern | Stage 6 | Stage 7 | Why it's better |
|---|---|---|---|
| Repeated searches | search → flight → flight-db, every time | **Cache-aside** in Redis: key `search:<origin>:<destination>:<date>`, TTL 300 s | Identical searches are answered from memory; flight and its database see less load |
| Knowing if it worked | Dashboards, but no repeatable load | **k6** benchmark: fixed rate, fixed routes, cache off vs on | One variable changes; the result is a measurement, not an impression |
| Cache visibility | — | `X-Cache: HIT/MISS` header, `cache_hits_total` / `cache_misses_total`, `cache.get` / `cache.set` spans | The Stage 6 signals now show the cache's effect too |
| Pod CPU numbers for Kubernetes | None (`kubectl top` fails) | **metrics-server** v0.8.1 in `kube-system` | The `metrics.k8s.io` API the HPA reads |
| Number of search Pods | Fixed per environment | **HPA** `search-hpa`: CPU target 70%, chart default 2–10, dev 1–3, prod 3–20 at 60% | Replicas follow load: more in a spike, fewer when quiet |
| Right-sizing requests | Stage 4 guess, never revisited | **VPA** `search-vpa` with `updateMode: "Off"` (staging/prod only) | Recommendations from real usage, applied by a person |
| Where search Pods land | Topology spread (from Stage 4) | + toleration for `workload=search:NoSchedule` + *preferred* node affinity for `apollo11.io/search-pool=dedicated` | Search can use a dedicated node pool without depending on it |
| Priority classes | Defined since Stage 4 | Same classes, now set per service in values | Booking and search are `apollo-airlines-app-critical`; notification is `apollo-airlines-app-low` |

## What's in the folder

`diff -r stages/stage6 stages/stage7` shows that only search's code changed. Every other service is the Stage 6 code.

| Path | What it is | New or replaces |
|---|---|---|
| `code/search/main.go`, `go.mod` | Redis client (`go-redis/v9`), cache-aside, `X-Cache`, cache counters and spans, cache state in readiness | Changes Stage 6's search |
| `code/search/cache_test.go` | Unit tests for `CACHE_ENABLED` and a bad `REDIS_URL` | New |
| `helm/apollo11/templates/autoscaling/search-hpa.yaml` | The HPA | New |
| `helm/apollo11/templates/autoscaling/search-vpa.yaml` | The VPA, `Off` mode | New |
| `helm/apollo11/templates/autoscaling/metrics-server-install.yaml`, `vpa-install.yaml` + `bundles/` | metrics-server v0.8.1 (with kind's `--kubelet-insecure-tls`); VPA 1.7.0 recommender and updater, no admission webhook | New |
| `helm/apollo11/templates/apps/search.yaml` | + `CACHE_ENABLED`, `REDIS_URL`, toleration, node affinity; topology spread now from values | Changes Stage 6's |
| `helm/apollo11/values.yaml` | + `redis.url`, `redis.cache.ttlSeconds`, `autoscaling`, `vpa`, `priorityClasses` names/values, search scheduling | Extends Stage 6's |
| `helm/apollo11/values-dev.yaml` / `values-prod.yaml` | Dev: HPA 1–3, VPA off. Prod: HPA 3–20 at 60%, VPA on | Extends Stage 6's |
| `overlays/dev/kustomization.yaml` | Same dev changes for the Kustomize path: patches the HPA to 1–3 and deletes the VPA | Extends Stage 6's |
| `k6/search.js`, `k6/README.md` | The search benchmark and its procedure | New |
| `scripts/apply.sh` | Installs metrics-server (and VPA outside dev) before the chart | Extends Stage 6's |
| `scripts/scaling-lab.sh` | Real load → HPA scale-out across workers → scale-in, then restores everything | New |
| — | `signals-lab.sh`, `slo-lab.sh`, `select-signals.py` | Removed: the observability stack now installs in one go |

## Walkthrough

```bash
export KUBE_CONTEXT=kind-apollo11
```

### Step 1: Deploy, and see what's new in the cluster

```bash
bash stages/stage7/scripts/apply.sh --env dev
kubectl get deploy metrics-server -n kube-system
kubectl top pods -n apollo-airlines-apps -l app=search        # works now
kubectl get hpa search-hpa -n apollo-airlines-apps
```

- **What happens:** [`apply.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/scripts/apply.sh) installs the Stage 6 stack as before, plus metrics-server. In dev it skips the VPA bundle. The HPA starts reporting `TARGETS` like `3%/70%` within about 30 s.
- **What metrics-server is:** a small cluster add-on that collects CPU and memory from each kubelet and serves them as the `metrics.k8s.io` API. `kubectl top` and the HPA both read it.
- **Why not use Prometheus for this?** Prometheus (Stage 6) is for people and alerts. The HPA reads the standard resource-metrics API, which metrics-server provides. Two consumers, two purposes.

### Step 2: Read the cache-aside code

[`search/main.go`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/code/search/main.go), trimmed:

```go
cacheKey := fmt.Sprintf("search:%s:%s:%s", origin, destination, date)   // same 3 inputs = same answer

cacheClient, _ := getRedisClient(ctx, time.Second)       // nil if CACHE_ENABLED=false or Redis is down
if cacheClient != nil {
    _, cacheSpan := tracer.Start(ctx, "cache.get", ...)  // shows up in the Stage 6 trace
    cached, cerr := cacheClient.Get(cacheCtx, cacheKey).Result()   // 1 s timeout
    if cerr == nil {
        cacheHitsTotal.WithLabelValues("search").Inc()
        c.Header("X-Cache", "HIT")
        c.String(http.StatusOK, cached)                  // flight is never called
        return
    }
}
cacheMissesTotal.WithLabelValues("search").Inc()
// ... call flight, build the result ...
cacheClient.Set(setCtx, cacheKey, payloadBytes, time.Duration(cacheTTLSeconds)*time.Second)   // 300 s
c.Header("X-Cache", "MISS")
```

- **What cache-aside means:** the application, not Redis, decides. Look in the cache; on a miss, ask the source of truth (flight) and store the answer with an expiry (TTL).
- **Why a TTL and not "update the cache when a seat is booked":** search results can be up to 5 minutes old without harm. Booking never reads this cache; it asks flight directly for seats. A TTL keeps the design simple and bounds how stale an answer can be.
- **Why the cache is optional:** every Redis call has a 1 s timeout. On any error the code logs a warning and treats it as a miss. Redis failing makes search slower, not broken.
- **Why Redis is already there:** Redis has been a StatefulSet with a PVC since Stage 3, used by notification. Stage 7 reuses it (`REDIS_URL=redis://redis:6379`).
- **`CACHE_ENABLED`:** set from `apps.search.cacheEnabled` in values. Setting it to `false` turns the cache off without a new image. Step 3 uses that for the baseline.

### Step 3: Measure the baseline before turning the cache on

A change is only "better" against a measured "before". The [k6 README](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/k6/README.md) holds the full procedure, with a trap that restores everything on exit. Its core:

```bash
NS=apollo-airlines-apps
kubectl port-forward -n $NS svc/search 18083:8083 >/dev/null 2>&1 &   # bypass the Gateway: measure the app, not TLS
kubectl delete hpa search-hpa -n $NS                  # pause autoscaling: replica count must not change mid-run
kubectl scale deploy/search -n $NS --replicas=1
export SEARCH_DATE=$(date -u +%F)

kubectl set env deploy/search -n $NS CACHE_ENABLED=false
kubectl rollout status deploy/search -n $NS            # restart the port-forward if the rollout ended it
BASE_URL=http://localhost:18083 EXPECT_CACHE=off \
  k6 run --summary-export baseline-summary.json stages/stage7/k6/search.js
```

What [`search.js`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/k6/search.js) holds fixed:

```js
const ROUTES = [['BOM','SIN'], ['SIN','BOM'], ['DEL','DXB'], ['DXB','DEL'], ['BOM','LHR'], ['DEL','JFK']];
scenarios: { search: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: '2m' } },
thresholds: {
  checks: ['rate==1'],                    // every response must contain real flights
  http_req_duration: ['p(95)<200'],       // lab acceptance criteria, not an SLO
  dropped_iterations: ['count==0'],       // k6 itself must keep up
  cache_hit_rate: EXPECT_CACHE === 'off' ? ['rate==0'] : ['rate>0.9'],
},
// setup() warms the six keys first; that traffic is not measured
```

- **What a fair comparison needs:** same image, date, routes, request rate and replica count. Only `CACHE_ENABLED` changes. That is why the HPA is paused: if replicas also changed, you couldn't tell which change helped.
- **Why constant arrival rate:** k6 sends 50 requests/s whether responses are fast or slow. A slow service then shows up as latency or dropped iterations, not as fewer requests.
- **Use Stage 6 while it runs:** in Prometheus, `sum(rate(http_requests_total{service="flight",path="/api/flights"}[1m]))` shows the load search puts on flight. With the cache off it matches search's rate.
- **A failed threshold is a result:** if the baseline misses `p(95)<200`, k6 exits non-zero. That is data, not a broken lab.

### Step 4: Turn the cache on, and prove it three ways

```bash
kubectl set env deploy/search -n $NS CACHE_ENABLED=true
kubectl rollout status deploy/search -n $NS
BASE_URL=http://localhost:18083 EXPECT_CACHE=on \
  k6 run --summary-export optimized-summary.json stages/stage7/k6/search.js
jq '.metrics | {p95: .http_req_duration["p(95)"], failed: .http_req_failed.value, hit_rate: .cache_hit_rate.value, dropped: .dropped_iterations.count}' \
  baseline-summary.json optimized-summary.json
```

Then look at one key directly:

```bash
D=$(date -u +%F); URL="http://localhost:8083/api/search?origin=BOM&destination=SIN&date=$D"
kubectl exec -n $NS redis-0 -- redis-cli del "search:BOM:SIN:$D"
kubectl exec -n $NS deploy/search -- sh -c "wget -S -O /dev/null '$URL' 2>&1 | grep -i x-cache"   # MISS
kubectl exec -n $NS deploy/search -- sh -c "wget -S -O /dev/null '$URL' 2>&1 | grep -i x-cache"   # HIT
kubectl exec -n $NS redis-0 -- redis-cli ttl "search:BOM:SIN:$D"                                 # <= 300, counting down
kubectl exec -n $NS deploy/search -- wget -qO- http://127.0.0.1:8083/metrics | grep '^cache_'
```

- **The three proofs:** the header says which code path ran; the counters say how often; the Redis key says what is stored and for how long. The header alone could be wrong; the three together can't all be.
- **What to expect:** hit rate 0 with the cache off, above 0.9 with it on. Flight's request rate in Prometheus drops sharply. Whether p95 improves on a laptop with six routes is **an observation, not a given**. Record what you measured.
- **Why the hit rate is so high here:** six routes repeat. Each (origin, destination, date) is its own key, so real traffic spread over many routes and dates gets a lower hit rate.
- **Restore before moving on:** exit the k6 README's terminal to trigger its restore, or run `bash stages/stage7/scripts/apply.sh --env dev --skip-build`. Check `kubectl get hpa search-hpa -n $NS` is back.

What the cache costs, so you know it when you see it:

- **Stale answers:** book a seat on a cached flight and, for up to 300 s, search still shows the old seat count with `X-Cache: HIT`. Flight shows the new count. `redis-cli del` on the key, or waiting for the TTL, fixes it.
- **Redis down:** `kubectl scale sts/redis -n $NS --replicas=0` and search keeps answering `200`, all misses. Its readiness endpoint reports the cache but stays ready: `kubectl exec -n $NS deploy/search -- wget -qO- http://127.0.0.1:8083/healthz/ready` returns `{"cache":"unreachable","status":"ready"}`. Flight takes the full load again. Notification also uses Redis, so scale it back to 1 right away. Search reconnects by itself.
- **Compared with Stage 4:** readiness there meant "my required dependencies work". Here the cache is *optional*, so readiness reports it but doesn't fail on it. Pulling search out of the Service because Redis is down would turn a slowdown into an outage.

### Step 5: Read the HPA, and why it needs Stages 4 and 6

An **HPA** (HorizontalPodAutoscaler) is a controller that changes a Deployment's replica count to keep a metric near a target. [`search-hpa.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/helm/apollo11/templates/autoscaling/search-hpa.yaml):

```yaml
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef: {kind: Deployment, name: search}
  minReplicas: 2            # values-dev.yaml: 1
  maxReplicas: 10           # values-dev.yaml: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {type: Utilization, averageUtilization: 70}   # % of the CPU *request*
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0            # react at once
      policies: [{type: Percent, value: 100, periodSeconds: 30}, {type: Pods, value: 4, periodSeconds: 30}]
      selectPolicy: Max                        # whichever adds more
    scaleDown:
      stabilizationWindowSeconds: 300          # wait 5 min of lower load before removing Pods
      policies: [{type: Percent, value: 50, periodSeconds: 60}]
```

```bash
kubectl describe hpa search-hpa -n $NS | sed -n '/Metrics:/,/Events:/p'
kubectl get deploy search -n $NS -o jsonpath='{.spec.template.spec.containers[0].resources}{"\n"}'
```

- **The formula:** `desired = ceil(current replicas × current utilisation ÷ target)`. Two Pods at 140% against 70% → `ceil(2 × 140 / 70) = 4`, then capped at `maxReplicas` (3 in dev).
- **Why it needs Stage 4:** utilisation is *usage ÷ request*. Search requests 100m CPU (requests = limits, Guaranteed QoS), so 70% means 70m per Pod. Without a CPU request there is no denominator. The HPA shows `<unknown>/70%` and does nothing.
- **Why it needs Stage 4's probes too:** new replicas get traffic only once their readiness probe passes. Without that, scaling out would send requests to Pods still starting.
- **Why it comes after Stage 6:** you can't tune a target you can't see. The Stage 6 dashboards show whether more replicas actually lowered latency, or whether the bottleneck is elsewhere (flight, the database).
- **Why scale up fast and down slow:** a spike hurts passengers now; extra Pods for five minutes only cost a little. Removing Pods on every dip would cause churn.
- **Compared with Stage 5:** `apps.search.replicas` in values is now just the starting point. The HPA owns the replica count at runtime.

### Step 6: Watch it scale under real load, and where the new Pods land

```bash
# terminal 2
watch -n3 "kubectl get hpa search-hpa -n apollo-airlines-apps; kubectl get pods -n apollo-airlines-apps -l app=search -o wide"
# terminal 1
bash stages/stage7/scripts/scaling-lab.sh run
```

[`scaling-lab.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage7/scripts/scaling-lab.sh) does, in order:

1. Labels one worker `apollo11.io/search-pool=dedicated` and taints it `workload=search:NoSchedule`, then recreates the search Pods.
2. Lowers the HPA target to 10% and the scale-down window to 30 s, so a laptop can show it quickly. It records the originals first.
3. Starts a `search-load` Deployment: four Pods making real HTTP searches. No faked CPU.
4. Waits for replicas to rise above `minReplicas`, and checks they span at least two workers.
5. Deletes the load and waits for scale-in back to `minReplicas`.
6. On exit, even after a failure, restores the HPA and removes the label, taint and load. If it was killed: `bash stages/stage7/scripts/scaling-lab.sh cleanup`.

The search scheduling rules, from `values.yaml`:

```yaml
tolerations:                         # permission to run on the tainted node, not an instruction to
  - {key: workload, operator: Equal, value: search, effect: NoSchedule}
affinity:
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:   # soft: raises the node's score
      - weight: 100
        preference: {matchExpressions: [{key: apollo11.io/search-pool, operator: In, values: [dedicated]}]}
topologySpreadConstraints:           # from Stage 4: keep replicas balanced across nodes
  - {maxSkew: 1, topologyKey: kubernetes.io/hostname, whenUnsatisfiable: ScheduleAnyway}
```

- **What you see:** `TARGETS` climbs above 10%, `REPLICAS` goes 1 → 3, the new Pods land on *both* workers, then it drops back to 1.
- **Why both workers:** the taint keeps *other* workloads off the dedicated node. The toleration only *allows* search there. Preferred affinity makes that node score higher, and topology spread pushes replicas apart. All three are soft for search, so it keeps running if the dedicated node is full.
- **Why this placement matters only now:** with a fixed replica count, placement was decided once. With an HPA, the scheduler places new Pods during every spike.
- **Watch out:** the HPA changes a number, it doesn't create capacity. If nodes are full, extra Pods stay `Pending` with `Insufficient cpu`, as in Stage 4.
- **Priority:** search and booking run as `apollo-airlines-app-critical`, notification as `apollo-airlines-app-low`. When a scale-out has no room left, the scheduler can evict low-priority Pods to make room for critical ones.

### Step 7: VPA: advice on requests, not action

A **VPA** (VerticalPodAutoscaler) watches a workload's real CPU and memory use and recommends requests. Dev turns it off, so render it for staging:

```bash
C=stages/stage7/helm/apollo11
helm template apollo11 $C -f $C/values-staging.yaml --show-only templates/autoscaling/search-vpa.yaml
```

```yaml
# search-vpa.yaml
kind: VerticalPodAutoscaler
spec:
  targetRef: {kind: Deployment, name: search}
  updatePolicy:
    updateMode: "Off"            # recommend only; never change running Pods
  resourcePolicy:
    containerPolicies:
      - containerName: search
        minAllowed: {cpu: 50m, memory: 64Mi}
        maxAllowed: {cpu: 1, memory: 512Mi}
        controlledResources: ["cpu", "memory"]
```

- **Where the advice appears (staging/prod):** `kubectl describe vpa search-vpa -n apollo-airlines-apps` → `Recommendation` with `Target`, `Lower Bound`, `Upper Bound`. It stays empty until the recommender has collected samples.
- **Why `Off`:** the HPA scales on *usage ÷ request*. If the VPA also changed the request, every change would move the HPA's ratio, the HPA would add or remove Pods, which changes per-Pod usage, and the two controllers would chase each other.
- **How advice is used:** a person reads the recommendation and edits the tier in `values.yaml`, then rolls it out through Helm or Argo CD (Stage 5). The change stays reviewed and in Git.
- **Why no admission webhook:** in `Off` mode the VPA never changes Pods, so the bundle installs only the recommender and updater.
- **Why off in dev:** its controllers cost resources, and a short-lived local cluster has too little history for useful advice.
- **Compared with Stage 4:** the 100m / 128Mi tiers were chosen by reasoning. The VPA is the first thing in the course that checks them against real usage.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| HPA `TARGETS <unknown>/70%`, `ScalingActive=False`, `FailedGetResourceMetric` | No CPU request on the Pods, or metrics-server not ready | `kubectl describe hpa search-hpa -n apollo-airlines-apps`; `kubectl top pods -n apollo-airlines-apps` |
| `kubectl top` fails | metrics-server missing or not ready | `kubectl get deploy metrics-server -n kube-system` |
| HPA wants more replicas, Pods `Pending` | Nodes are full | `kubectl describe pod <pending-pod>` → Events |
| Replicas don't drop after load stops | Scale-down window is 300 s by design | Wait; `kubectl get hpa -w` |
| Always `X-Cache: MISS` | `CACHE_ENABLED=false` left over, or Redis unreachable | `kubectl exec -n apollo-airlines-apps deploy/search -- wget -qO- http://127.0.0.1:8083/healthz/ready` |
| Search shows old seat counts | Cached answer within its 300 s TTL | `kubectl exec -n apollo-airlines-apps redis-0 -- redis-cli ttl search:<from>:<to>:<date>` |
| k6 setup: no seeded results | `SEARCH_DATE` outside the seeded range | Set `SEARCH_DATE` to a date within the next 30 days |
| `kubectl get vpa` finds nothing | Dev disables VPA | Use `values-staging.yaml`, or render with `helm template` |
| `search-load` or a `workload=search` taint left behind | `scaling-lab.sh` was killed | `bash stages/stage7/scripts/scaling-lab.sh cleanup` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| The HPA can add Pods, not nodes | A big spike ends with `Pending` Pods | [Stage 9](./stage-9) (planned): Lunar Orbit, Cluster Autoscaler on EKS |
| Only search autoscales, and only on CPU | Work driven by queues or events doesn't show up as CPU | [Stage 11](./stage-11) (planned): KEDA track |
| Search results can be up to 5 minutes stale | A sold-out flight may still show seats in search | A deliberate trade-off; booking checks flight directly |
| VPA advice must be applied by hand, and dev has none | Requests drift from reality unless someone reads it | — (by design in `Off` mode) |
| Secrets are base64 in Git, no RBAC, NetworkPolicies not enforced, Grafana open | This deployment is not hardened. Do not describe it as such | [Stage 8](./stage-8) (planned): Command Module (security) |
| No view of what all these replicas cost | Scaling decisions are made without cost data | [Stage 11](./stage-11) (planned): Kubecost track |
| Everything still runs on a local kind cluster | No real load balancer, disks or node failures | [Stage 9](./stage-9) (planned): Lunar Orbit (AWS lifecycle) |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 | **Stage 7** |
|---|---|---|---|---|---|---|---|---|---|
| Runs on | One Docker host | 3-node kind | Same | Same | Same | Same | Same | Same | Same |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment | + StatefulSet | Same | Helm release | + observability | Same |
| Recovery | `restart:` | None | ReplicaSet | Same | Same | + probes restart / drain | + Argo CD self-heal | Same | Same |
| Service discovery | Docker DNS | Pod IP | Service + DNS | + cross-namespace DNS | + headless Services | Same | Same | + ServiceMonitors | Same |
| Entry point | `ports:` | `port-forward` | NodePort | DNS → NodePort → Traefik + TLS → MetalLB → Envoy Gateway API | Envoy Gateway | Same | Same | + `grafana.apollo.local` | Same |
| Config / secrets | `environment:` | Inline | ConfigMap / Secret | Same | Same | Same | Rendered from values | + `observability:` | + `autoscaling:`, `vpa:`, `redis.cache` |
| Data | Named volume | — | `emptyDir` | `emptyDir` | PVCs | Same | Same | + telemetry PVCs | + Redis as search cache |
| Health checks | Compose healthcheck | None | Liveness + readiness | Same | Same | Startup / liveness / readiness | Same | + SLO and alerts | Search readiness reports cache state |
| Resources | None | None | None | None | None | Requests = limits, PDBs | Per-env values | Same | + VPA advice (staging/prod) |
| How it's deployed | `docker compose up` | `kubectl apply` | `apply.sh` | Same | Same | Same | Helm / Kustomize / Argo CD | + `signals-lab.sh` | + metrics-server, k6, `scaling-lab.sh` |
| Observability | `docker logs` | `kubectl logs` | `kubectl logs` | Same | Same | Same | Same | Metrics, dashboards, SLO, logs, traces | + cache counters and spans |
| Scaling | Fixed | — | Fixed (2) | Fixed | Fixed | Fixed | Fixed per env | Fixed per env | **HPA on search (dev 1–3, default 2–10, prod 3–20)** |

## Clean up

```bash
pkill -f 'port-forward' || true
kubectl get hpa,deploy -n apollo-airlines-apps        # HPA present, no search-load
bash stages/stage7/scripts/verify.sh --mode helm --env dev    # optional: the full automated check
bash stages/stage7/scripts/teardown.sh --purge
kubectl get ns | grep apollo                          # nothing
```

`--purge` also removes metrics-server, the VPA controllers (if installed), the access stack and related CRDs.

## You should now be able to explain

- Why we measured search with the cache off before turning it on, and why the HPA had to be paused for that.
- How cache-aside works, what the 300 s TTL trades away, and why booking never reads the cache.
- Why a Redis outage makes search slower but leaves it Ready.
- Why the HPA cannot scale on CPU without Stage 4's requests, and what `<unknown>` means.
- How to work out the HPA's next replica count, and why scale-down waits five minutes.
- The difference between a taint, a toleration, preferred affinity and topology spread.
- Why the VPA runs in `Off` mode next to a CPU-based HPA.

**Next:** this completes the supported local path. The [Capstone](./capstone) puts Stages 1–7 together; [Stage 8: Command Module](./stage-8) (planned) is where security hardening begins.
