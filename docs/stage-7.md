---
title: "Stage 7 — Orbital Maneuvering: Autoscaling & Scheduling"
description: "Explore cache-aside behavior, horizontal and vertical autoscaling, capacity, and workload placement."
sidebar_label: "Stage 7: Scaling & Scheduling"
---

# Stage 7: Orbital Maneuvering — Autoscaling & Scheduling

:::info[Page type · optional lab]
This lab uses the pinned Apollo11 revision and requires k6. Capture a baseline
before changing cache or scaling controls, and run the documented cleanup after interruption.
:::

:::note[Take the controls · Orbital Maneuvering lab]
Bring more traffic to the airline and watch caching, scaling, and placement respond.
For the explanation before the experiment, start with the
[Orbital Maneuvering chapters](./learn/scaling/measurement-baseline). You can return to this lab whenever you’re ready.

Already read them? [Jump to the investigations](#-investigations-follow-the-controller-hand-offs).
:::

Stage 6 gave you signals to investigate by hand. Stage 7 adds controllers that
react to resource measurements automatically. Until now the replica counts were
fixed. That made the resources easy to follow, but the application could not
respond to changing demand.

Search traffic is a good example. Repeated flight queries can be answered from a
cache, and when CPU use rises, the work can be spread across more Pods. Neither
happens by magic. How well they work depends on cache validity, metrics
availability, the scheduler's capacity, and the HPA's limits.

In **Stage 7 (Orbital Maneuvering)**, you make Apollo Airlines **elastic and cache-friendly**:
1. **Redis cache-aside:** the `search` service gets a cache that answers flight availability queries from memory. The `X-Cache: HIT/MISS` response header shows which path a request took.
2. **Horizontal Pod Autoscaler (HPA v2):** `search` scales on CPU utilization reported by `metrics-server`. The chart defaults use 2–10 replicas. The local dev override uses 1–3 so that it fits on a workstation.
3. **Vertical Pod Autoscaler (VPA):** VPA runs in recommendation-only mode (`updateMode: "Off"`). It suggests CPU and memory sizes based on real usage history.
4. **Scheduling lab:** a reversible experiment with **node taints, tolerations, node affinity, and topology spread constraints**, where you can watch the effects.

<details>
<summary><strong>Optional conceptual refresher</strong></summary>

The Orbital Maneuvering chapters are the primary explanation. Expand this
section when you want the older scaling and scheduling account beside the lab.

```mermaid
flowchart TD
  subgraph Client ["Client Traffic"]
    Req["GET /api/search?origin=BOM&dest=SIN&date=..."]
  end

  subgraph SearchService ["Search Microservice (Cache-Aside)"]
    SearchApp["search (Go / Gin)\n(Port :8083)"]
    CacheCheck{"Check Redis Cache\nsearch:BOM:SIN:date"}
  end

  subgraph BackingServices ["Backing Infrastructure"]
    RedisStore[("redis (Redis 7)\nTTL: 300s")]
    FlightSvc["flight (Go / Gin)\n(Source of Truth)"]
  end

  subgraph AutoscalingEngine ["Kubernetes Autoscaling Engine"]
    MetricsServer["metrics-server\n(metrics.k8s.io)"]
    HPA["search-hpa (autoscaling/v2)\n(Target: 70% CPU, Min: 2, Max: 10)"]
    VPA["search-vpa (autoscaling.k8s.io)\n(updateMode: Off - Recommendations)"]
  end

  Req --> SearchApp
  SearchApp --> CacheCheck
  CacheCheck -->|HIT: Return cached JSON\nX-Cache: HIT| SearchApp
  CacheCheck -->|MISS: Forward to flight\nStore in Redis (SETEX 300)\nX-Cache: MISS| FlightSvc
  FlightSvc --> SearchApp
  CacheCheck -.-> RedisStore

  MetricsServer -->|Node/Pod CPU metrics| HPA
  HPA -->|Scales Replicas 2 -> 10| SearchApp
  MetricsServer -->|Historical Metrics| VPA
```

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Implement the **cache-aside pattern** with bounded keys, TTLs, graceful fallback, and Prometheus metrics.
2. Explain how the **HorizontalPodAutoscaler (HPA v2)** calculates the desired replica count from CPU requests.
3. Configure **stabilization windows and scaling policies** to stop replicas from rapidly scaling up and down (flapping).
4. Explain why **VPA and HPA must not compete** on the same metric, and how to run VPA in recommendation-only mode.
5. Compare **node taints** (repel Pods), **tolerations** (allow Pods), and **node affinity** (attract Pods).

---

## ⚡ 1. Use Redis as a cache, not as the source of truth

`search` asks `flight` for results and uses Redis to avoid repeating the same
read within a short time. `flight` remains the source of truth. Redis only holds
a copy that expires. This explains both the speed-up and the fact that results
can be stale until the 300-second TTL (time to live) runs out.

### The request flow
When a search request arrives:
1. **Build the key.** The cache key is predictable:
   `search:{origin}:{destination}:{date}`, for example `search:BOM:SIN:2026-06-17`.
2. **Look it up.** `search` runs `GET search:...` against Redis.
   - **Cache hit:** it returns the cached JSON right away, adds the response header `X-Cache: HIT`, and increments the Prometheus counter `cache_hits_total{service="search"}`.
   - **Cache miss:** it forwards the request to `flight`, stores the response in Redis for 5 minutes (`SETEX key 300 value`), adds `X-Cache: MISS`, and increments `cache_misses_total`.
3. **Fall back if Redis fails.**
   If Redis is unavailable, the `search` code in the repository logs a warning and
   queries `flight` directly. Redis is therefore not required for normal search to
   work, although the request to `flight` can still fail on its own.

---

## 📈 2. HPA changes desired replicas from a measured ratio

The HPA is another controller. At regular intervals it reads the Metrics API,
which `metrics-server` provides in this lab (it does not use Prometheus). It
calculates a desired replica count and writes it to the target Deployment's scale
subresource. The Deployment and ReplicaSet from Stage 1 then create or remove
the Pods. The HPA itself neither creates nor schedules Pods.

### The formula gives a recommendation, which limits then constrain
```text
Desired Replicas = ceil(Current Replicas * (Current Metric Value / Target Metric Value))
```

For example:
- There are 2 replicas.
- Each Pod requests `100m` of CPU.
- The target CPU utilization is `70%`, which is `70m` per Pod.
- Traffic surges and average CPU use rises to `140m` per Pod (140% utilization):
```text
Desired Replicas = ceil(2 * (140% / 70%)) = 4 replicas
```

:::important[The HPA needs CPU requests]
The HPA measures CPU utilization as a percentage of the container's **CPU `requests`**. If a Deployment does not set `resources.requests.cpu`, the HPA cannot calculate utilization and shows `TARGETS: <unknown>`.
:::

### Reading `search-hpa.yaml`

*A minimal rendering of `stages/stage7/helm/apollo11/templates/autoscaling/search-hpa.yaml`, using the defaults from `stages/stage7/helm/apollo11/values.yaml`.*

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: search-hpa
  namespace: apollo-airlines-apps
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: search
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
        - type: Pods
          value: 4
          periodSeconds: 30
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

### Why scaling up fast and scaling down slowly are different decisions
- **`scaleUp`:**
  `stabilizationWindowSeconds: 0` means the HPA adds no extra delay before
  scaling up. It still has to wait for metrics to be collected and for its own
  reconciliation. The policy allows doubling the replicas (`100%`) or adding `4`
  Pods in each 30-second period, whichever is larger (`selectPolicy: Max`).
- **`scaleDown`:**
  `stabilizationWindowSeconds: 300` (5 minutes). After traffic drops, the HPA
  waits 5 minutes before removing Pods. This prevents **flapping**: repeatedly
  creating and deleting Pods when traffic goes up and down.

---

## 📊 3. VPA observes a different lever

The HPA changes the *number* of Pods. The VPA recommender looks at how much
CPU and memory the Pods actually use and can suggest different requests. This
matters because the CPU request is also the denominator in the HPA's utilization
calculation.

### Why VPA and HPA must not compete
If the HPA scales on CPU utilization while the VPA changes the CPU request of the
same Pods, the two controllers can set off an unstable feedback loop:
1. VPA raises the CPU request from `100m` to `200m`.
2. That doubles the denominator in the HPA's utilization formula.
3. HPA now sees lower average utilization and, subject to its scale-down
   behavior, can reduce the replicas.
4. The remaining replicas carry more load, so VPA raises the requests again.

### The solution: recommendation mode
In Stage 7, VPA is configured like this:

*Source: `stages/stage7/helm/apollo11/templates/autoscaling/search-vpa.yaml` (the `updateMode` setting)*
```yaml
spec:
  updateMode: "Off"
```
In `Off` mode, VPA watches live container usage and publishes recommendations (`Target`, `LowerBound`, `UpperBound`). It does not evict or modify any Pods. It is advice for a person doing capacity planning.

---

## 🧭 4. Scheduling starts with eligibility, then preference

Stage 4 introduced a soft topology preference. This lab shows three more inputs
to the scheduler. Each answers a different question: is this node closed to Pods
by default, is this Pod allowed onto it anyway, and which of the allowed nodes
does the Pod prefer?

```
                  ┌────────────────────────────────────────────────────────┐
                  │ Worker Node: apollo11-worker                           │
                  │ Taint: workload=search:NoSchedule                      │
                  │ Label: apollo11.io/search-pool=dedicated               │
                  └────────────────────────────────────────────────────────┘
                               ▲                               ▲
                               │ REPELLED                      │ ATTRACTED
                               │                               │
                ┌──────────────┴──────────┐     ┌──────────────┴──────────┐
                │ Pod: identity           │     │ Pod: search             │
                │ (No toleration)         │     │ Toleration: workload    │
                │ Result: CANNOT SCHEDULE │     │ NodeAffinity: preferred │
                └─────────────────────────┘     │ Result: PLACED ON NODE  │
                                                └─────────────────────────┘
```

1. **Taints** (set on a node):
   a taint tells the scheduler: *"Do not place Pods here unless they tolerate this taint."*
   Example: `workload=search:NoSchedule`.
2. **Tolerations** (set on a Pod):
   a toleration tells the scheduler: *"This Pod may run on nodes with the matching taint."* It does not *force* the Pod onto that node. It only removes the restriction.
3. **Node affinity** (set on a Pod):
   tells the scheduler: *"Prefer, or require, nodes that have these labels."*
   - `preferredDuringSchedulingIgnoredDuringExecution`: a soft preference. Matching nodes score higher.
   - `requiredDuringSchedulingIgnoredDuringExecution`: a hard requirement. If no node matches, the Pod is not scheduled.

---

</details>

## 🧪 Investigations: follow the controller hand-offs

Caching happens inside `search`. The HPA changes the Deployment's desired replica
count. The scheduler places the resulting Pods. In this project the VPA only makes
recommendations. Keep these roles separate as you work through the exercises.

### Exercise 1: Deploy Stage 7 and check for Redis cache hits

**Prediction:** two identical requests within the TTL should give a cache miss
and then a cache hit. The header shows which code path the request took. It does
not measure latency, and it does not prove the response is never stale.

- **Objective**: Deploy Stage 7 and check the `X-Cache` response headers.
- **Starting Point**: A running `kind-apollo11` cluster.
- **Instructions**:

```bash
cd Apollo11

# 1. Deploy Stage 7 in Helm dev mode
bash stages/stage7/scripts/apply.sh --env dev

# 2. Find the Gateway address and use a date that exists in the seed data
GATEWAY_IP=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
CACHE_DATE=$(date -u +%F)

# First request: cache miss
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=SIN&date=${CACHE_DATE}" | grep -i "X-Cache"
# Output: X-Cache: MISS

# 3. Send exactly the same request again (second request: cache hit)
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=SIN&date=${CACHE_DATE}" | grep -i "X-Cache"
# Output: X-Cache: HIT
```

These commands adapt the request pattern from `stages/stage7/README.md` so that
the date is always valid. The seed SQL creates BOM→SIN flights relative to the day
the database was initialized.

- **Verification**: Send the second request before the 300-second TTL expires.
  The header should change from `MISS` to `HIT`.
- **Troubleshooting**: If the Gateway address is empty, run `kubectl describe
  gateway apollo-gateway -n apollo-airlines-apps`. If both requests are misses,
  check `kubectl logs -n apollo-airlines-apps deploy/search` and whether Redis is
  ready.

- **Concept reinforced**:
  The first request went to `flight` and stored the result in Redis (`MISS`). The
  second request was answered from Redis (`HIT`). The header alone does not tell
  you how much faster it was. Compare metrics to measure that.

---

### Exercise 2: Inspect the HPA and metrics-server

**Prediction:** the HPA needs both a working Metrics API and CPU requests on the
Pods it scales. An HPA that shows `<unknown>` targets is missing an input. It has
not decided to leave the replica count alone.

- **Objective**: Check that `metrics-server` gives the HPA live CPU metrics.
- **Starting Point**: Stage 7 is running.
- **Instructions**:

```bash
# 1. See current Pod resource use
kubectl top pods -n apollo-airlines-apps

# 2. Look at the search-hpa resource
kubectl get hpa search-hpa -n apollo-airlines-apps

# 3. Look at the HPA's conditions
kubectl describe hpa search-hpa -n apollo-airlines-apps | grep -A 5 Conditions:
```

- **Expected result**:
  `TARGETS` shows the current CPU utilization, for example `1% / 70%`.
  The conditions show `AbleToScale: True` and `ScalingActive: True`.
- **Verification command**: `kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/apollo-airlines-apps/pods`
  returns current Pod metrics.
- **Troubleshooting hints**: `<unknown>` usually means metrics are unavailable or
  CPU requests are missing. Check metrics-server and the HPA conditions before you
  change any thresholds.
- **Concept reinforced**: A CPU-based HPA divides observed usage by the declared
  CPU requests. Limits alone are not enough.

---

### Exercise 3: The scaling and scheduling lab

**Prediction:** each part of the script exercises a different component. The
taint changes which nodes accept Pods. The toleration and affinity affect where
`search` Pods are placed. The load changes the metrics. The HPA writes a new
desired replica count, and the Deployment creates the Pods.

- **Objective**: Run the automated scheduling lab and watch taints, node affinity, and HPA scale-out under real load.
- **Starting Point**: A healthy Stage 7 cluster.
- **Instructions**:

```bash
# Run the scaling lab
bash stages/stage7/scripts/scaling-lab.sh run
```

- **What the script does**:
  1. Taints `apollo11-worker` with `workload=search:NoSchedule` and labels it `apollo11.io/search-pool=dedicated`.
  2. Recreates the `search` Pods so the scheduler evaluates their toleration and
     preferred node affinity. `NoSchedule` stops new Pods that lack a toleration
     from landing on the node. It does not evict Pods that are already running there.
  3. Lowers the HPA's CPU threshold to `10%` and starts HTTP load-generator Pods inside the cluster.
  4. Watches the `search` replicas **scale out from 1 to 3** across the worker nodes.
  5. Stops the load and checks that the HPA **scales back in to the baseline** once the stabilization window has passed.
  6. Restores the original node labels, taints, and HPA threshold.

- **Expected result**: The script reports a scale-out, placement on at least two
  different worker nodes, a scale-in, and a successful cleanup.
- **Verification command**: After the script exits, `kubectl get hpa search-hpa -n
  apollo-airlines-apps` shows the original target, and no `search-load`
  Deployment remains.
- **Troubleshooting hints**: If the script is interrupted, run `bash
  stages/stage7/scripts/scaling-lab.sh cleanup`. The lab needs two nodes labeled
  `node-role=worker` and working metrics-server data.
- **Concept reinforced**: Taints decide which nodes accept a Pod, affinity affects
  which allowed node scores higher, topology spread affects distribution, and the
  HPA controls the replica count.

---

### Exercise 4: Read the VPA's sizing recommendations

**Question:** does the VPA change the running `search` Pods? In `Off` mode it
should only publish recommendations for a person to review, and leave the Pods
alone.

- **Objective**: Read the resource recommendations that the Vertical Pod Autoscaler produces.
- **Starting Point**: Stage 7 deployed with the staging or prod values. The dev
  values set `vpa.search.enabled=false` on purpose, so this resource does not
  exist in the default local setup.
- **Instructions**:

```bash
kubectl get vpa search-vpa -n apollo-airlines-apps -o yaml | grep -A 15 recommendation:
```

- **Expected output**:
  The `target`, `lowerBound`, and `uncappedTarget` CPU and memory estimates from the VPA recommender.

- **Verification command**: `kubectl describe vpa search-vpa -n
  apollo-airlines-apps` shows `Update Mode: Off` along with any recommendation.

- **Troubleshooting**: In dev, a missing resource is expected. Where VPA is
  enabled, recommendations can be missing until the recommender has collected
  enough samples. Run `kubectl describe vpa search-vpa -n apollo-airlines-apps`
  before treating that as a failure.
- **Concept reinforced**: Recommendation mode gives you sizing information without
  changing Pods and without competing with the CPU-based HPA.

---

## 🏁 What You Learned

- How to implement the cache-aside pattern with Redis, and how to read `X-Cache` headers and Prometheus metrics.
- How the Horizontal Pod Autoscaler calculates replica counts from CPU utilization.
- Why scaling up fast and down slowly prevents flapping.
- Why VPA in `Off` mode gives advice without conflicting with the HPA.
- How taints repel Pods, tolerations allow them, and node affinity attracts them.

---

## ✈️ Before Continuing: Checkpoint

Before you read the Cloud Appendix and the advanced topics, test your understanding:
1. If an application sets no CPU `requests`, can the HPA scale it on CPU utilization?
2. Why is the `scaleDown` stabilization window 300 seconds rather than 0?
3. What is the main difference between a node taint and node affinity?
4. What happens if both the HPA and the VPA actively manage CPU for the same Deployment?

Congratulations! You have completed the **Core Kubernetes Learning Path** that
has been verified so far (Ignition through Stage 7). You have packaged, observed,
and scaled a complete microservices platform. Security hardening is still planned
for Stage 8, so do not describe this deployment as hardened yet.

Next, see how these ideas apply on a real cloud provider such as AWS EKS, and
read the security and specialization roadmaps.

👉 **Continue to [Cloud Appendix: EKS Research Boundary](./eks)**

## Current verification boundary

The check counts quoted in earlier stages are historical. The verified repository
revision is commit `69113dcc80f77e32301d8ee7b9e73a67c923de96`. It includes
context guards, external ownership of the TLS certificate, HTTPS API endpoints in
the frontend, and ServiceAccount token automount protection. To validate your own
environment, use the summary from the current verification script together with
what you observe yourself. A production docs build only checks that the pages
compile and the links work. It does not test the cluster.

Before you interpret an HPA result, take the cache baseline described in
[Measurement before optimization](./learn/scaling/measurement-baseline).
