---
title: "Stage 7 — Orbital Maneuvering: Autoscaling & Scheduling"
description: "Master Redis cache-aside, Horizontal Pod Autoscaling (HPA v2), Vertical Pod Autoscaler (VPA), node taints, tolerations, and affinity."
sidebar_label: "Stage 7: Scaling & Scheduling"
---

# Stage 7: Orbital Maneuvering — Autoscaling & Scheduling

:::note[Take the controls · Orbital Maneuvering lab]
Bring more traffic to the airline and watch caching, scaling, and placement respond.
For the explanation before the experiment, start with the
[Orbital Maneuvering chapters](./learn/scaling/measurement-baseline). You can return to this lab whenever you’re ready.
:::

Stage 6 gave us signals for people to investigate. Stage 7 introduces two
controllers that can react to resource measurements, while keeping the signals
and decision boundaries explicit. Previous stages used a deliberate, static replica count. That makes the
resource graph easy to inspect, but it cannot respond to changing demand. Search
traffic is a good Apollo example because repeated flight queries can be served
from a cache and, when CPU demand rises, can be distributed across more Pods.
Neither response is automatic magic: cache validity, metrics availability,
scheduler capacity, and the HPA's limits all constrain the result.

In **Stage 7 (Orbital Maneuvering)**, we make Apollo Airlines **elastic and cache-friendly**:
1. **Redis Cache-Aside**: We introduce a high-performance caching layer into the `search` service, serving flight availability queries from memory with observable `X-Cache: HIT/MISS` headers.
2. **Horizontal Pod Autoscaler (HPA v2)**: We scale `search` based on CPU
   utilization metrics supplied by `metrics-server`. Chart defaults use 2–10
   replicas; the local dev override uses 1–3 to fit a workstation.
3. **Vertical Pod Autoscaler (VPA)**: We deploy VPA in recommendation-only mode (`updateMode: "Off"`) to calculate ideal CPU and memory sizing based on real historical consumption.
4. **Advanced Scheduling Lab**: We run an observable, reversible scheduling experiment using **node taints, tolerations, node affinity, and topology spread constraints**.

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
1. Implement the **cache-aside pattern** with bounded keys, TTLs, graceful degradation, and Prometheus metrics.
2. Explain how **HorizontalPodAutoscaler (HPA v2)** calculates desired replica count from CPU resource requests.
3. Configure **stabilization windows and scaling policies** to prevent rapid scaling oscillations (flapping).
4. Explain why **VPA and HPA must not compete** on the same metric, and how to use VPA in recommendation-only mode.
5. Contrast **node taints** (repelling pods), **tolerations** (permitting pods), and **node affinity** (attracting pods).

---

## ⚡ 1. Cache data without making cache availability the source of truth

`search` asks `flight` for results and uses Redis to avoid repeating the same
read within a short window. The source of truth remains `flight`; Redis holds a
time-bounded copy. That distinction explains both the performance benefit and
the possibility of stale data until the 300-second TTL expires.

### The Request Flow
When a search request arrives:
1. **Key Generation**: Build a deterministic cache key:
   `search:{origin}:{destination}:{date}` (e.g. `search:BOM:SIN:2026-06-17`).
2. **Cache Lookup**: Query Redis (`GET search:...`).
   - **Cache HIT**: Return the cached JSON payload immediately. Add the HTTP response header `X-Cache: HIT`, and increment the Prometheus counter `cache_hits_total{service="search"}`.
   - **Cache MISS**: Forward the request to `flight`. Store the response in Redis with a 5-minute Time-To-Live (`SETEX key 300 value`), add `X-Cache: MISS`, and increment `cache_misses_total`.
3. **Graceful Degradation**:
   If Redis fails, the checked-in `search` implementation logs a warning and
   falls back to querying `flight`. This removes Redis as a required dependency
   for the normal search path, although the downstream `flight` request can
   still fail independently.

---

## 📈 2. HPA changes desired replicas from a measured ratio

The HPA is another controller. It periodically reads the Metrics API supplied by
`metrics-server` in this lab—not the Prometheus query API—calculates
a desired replica count, and writes that count to its target Deployment's scale
subresource. The Deployment and ReplicaSet machinery from Stage 1 then create
or remove Pods. HPA does not schedule Pods and it does not create them directly.

### Read the formula as a recommendation, then look for constraints
```text
Desired Replicas = ceil(Current Replicas * (Current Metric Value / Target Metric Value))
```

For example:
- Current replicas = 2.
- CPU request per pod = `100m`.
- Target CPU utilization = `70%` (i.e. `70m` per pod).
- If traffic surges and average CPU usage jumps to `140m` (140% utilization):
```text
Desired Replicas = ceil(2 * (140% / 70%)) = 4 replicas
```

:::important[Requests Are Mandatory for HPA!]
HPA calculates CPU utilization as a percentage of the container's **CPU `requests`**. If a Deployment does not declare `resources.requests.cpu`, HPA cannot compute utilization and will report `TARGETS: <unknown>`!
:::

### Dissecting `search-hpa.yaml`

*Minimal rendered adaptation of `stages/stage7/helm/apollo11/templates/autoscaling/search-hpa.yaml`, using defaults from `stages/stage7/helm/apollo11/values.yaml`.*

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

### Why fast up and slow down are different risk decisions
- **`scaleUp`**:
  `stabilizationWindowSeconds: 0`, so this policy adds no extra scale-up
  stabilization delay. HPA still depends on metric collection and controller
  reconciliation. The policy permits doubling replicas (`100%`) or adding `4`
  Pods per 30-second policy period.
- **`scaleDown`**:
  `stabilizationWindowSeconds: 300` (5 minutes). When traffic drops, the HPA waits 5 minutes before terminating pods. This prevents **flapping** (rapidly creating and destroying pods if traffic fluctuates intermittently).

---

## 📊 3. VPA observes a different lever

HPA changes the *number* of Pods. A VPA recommender studies resource use and can
recommend different requests. That matters because CPU request is also the
denominator in HPA's utilisation calculation.

### Why VPA and HPA Must Not Fight!
If HPA is scaling Pod count based on CPU utilization, and VPA simultaneously changes the CPU request of those Pods, the two controllers enter an unstable feedback loop:
1. VPA increases CPU request from `100m` to `200m`.
2. This doubles the denominator in HPA's utilization formula!
3. On later reconciliation cycles, HPA observes lower average utilization and
   can reduce replicas subject to its scale-down behavior.
4. The remaining replicas experience higher load, causing VPA to increase requests again!

### The Solution: Recommendation Mode
In Stage 7, VPA is deployed with:

*Source: `stages/stage7/helm/apollo11/templates/autoscaling/search-vpa.yaml` (exact `updatePolicy` excerpt)*
```yaml
spec:
  updateMode: "Off"
```
In `Off` mode, VPA monitors live container usage and publishes statistical recommendations (`Target`, `LowerBound`, `UpperBound`) without evicting or modifying Pods. It acts as an advisory tool for human capacity planning!

---

## 🧭 4. Scheduling starts with eligibility, then preference

Stage 4 introduced a soft topology preference. This lab makes three different
scheduler inputs visible. They answer different questions: is a node eligible,
is a Pod allowed onto it, and among allowed nodes which ones should score higher?

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
                │ (No Toleration)         │     │ Toleration: workload    │
                │ Result: CANNOT SCHEDULE │     │ NodeAffinity: preferred │
                └─────────────────────────┘     │ Result: PLACED ON NODE! │
                                                └─────────────────────────┘
```

1. **Taints** (Node Property):
   A taint tells the scheduler: *"Do not place any Pods here unless they explicitly tolerate this taint."*
   Example: `workload=search:NoSchedule`.
2. **Tolerations** (Pod Property):
   A toleration tells the scheduler: *"This Pod is permitted to run on nodes with the matching taint."* (It does not *force* the Pod to go there; it simply unlocks the door).
3. **Node Affinity** (Pod Property):
   Tells the scheduler: *"Actively prefer or require nodes bearing specific labels."*
   - `preferredDuringSchedulingIgnoredDuringExecution`: Soft preference (score matching nodes higher).
   - `requiredDuringSchedulingIgnoredDuringExecution`: Hard requirement (fail scheduling if no matching node exists).

---

## 🧪 Investigations: follow the controller hand-offs

Cache behaviour happens inside `search`; HPA changes Deployment desired count;
the scheduler assigns the resulting Pods; VPA only recommends in this project.
Keep those actors separate while you inspect the system.

### Exercise 1: Deploy Stage 7 & Verify Redis Cache Hits

**Prediction:** identical requests within the TTL should demonstrate a cache
MISS followed by a HIT. The header proves the application branch taken; it does
not, by itself, measure latency or prove the response can never be stale.

- **Objective**: Deploy Stage 7 and verify `X-Cache` response headers.
- **Starting Point**: Running `kind-apollo11` cluster.
- **Instructions**:

```bash
cd Apollo11

# 1. Deploy Stage 7 in Helm dev mode
bash stages/stage7/scripts/apply.sh --env dev

# 2. Discover the assigned address and use a date present in the dynamic seed
GATEWAY_IP=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
CACHE_DATE=$(date -u +%F)

# First call: Cache MISS
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=SIN&date=${CACHE_DATE}" | grep -i "X-Cache"
# Output: X-Cache: MISS

# 3. Query the EXACT SAME route immediately (Second call: Cache HIT)
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=SIN&date=${CACHE_DATE}" | grep -i "X-Cache"
# Output: X-Cache: HIT
```

This command is a minimal date-safe adaptation of the request pattern in
`stages/stage7/README.md`; the seed SQL creates BOM→SIN flights relative to the
day the database is initialized.

- **Verification**: Run the second request before the 300-second TTL expires;
  the headers should change from `MISS` to `HIT`.
- **Troubleshooting**: If the address is empty, inspect `kubectl describe
  gateway apollo-gateway -n apollo-airlines-apps`. If both requests are misses,
  inspect `kubectl logs -n apollo-airlines-apps deploy/search` and Redis
  readiness.

- **What Concept This Reinforces**:
  The first request queried `flight` and stored the payload in Redis (`MISS`).
  The second request used Redis (`HIT`). Do not infer a latency target from this
  header alone; compare metrics if you want to measure the performance effect.

---

### Exercise 2: Inspecting HPA and Metrics Server

**Prediction:** HPA needs both an available Metrics API and CPU requests on its
target Pods. A visible HPA object with `<unknown>` targets means the controller
lacks an input, not that it has decided not to scale.

- **Objective**: Verify that `metrics-server` supplies live CPU metrics to HPA.
- **Starting Point**: Stage 7 running.
- **Instructions**:

```bash
# 1. Inspect top pod resource consumption
kubectl top pods -n apollo-airlines-apps

# 2. Inspect the search-hpa resource
kubectl get hpa search-hpa -n apollo-airlines-apps

# 3. Inspect HPA conditions
kubectl describe hpa search-hpa -n apollo-airlines-apps | grep -A 5 Conditions:
```

- **Expected Result**:
  `TARGETS` shows current CPU utilization (e.g. `1% / 70%`).
  Conditions show `AbleToScale: True` and `ScalingActive: True`.
- **Verification command**: `kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/apollo-airlines-apps/pods`
  returns current Pod metrics.
- **Troubleshooting hints**: `<unknown>` usually means metrics are unavailable
  or CPU requests are missing. Inspect metrics-server and HPA conditions before
  changing thresholds.
- **Concept reinforced**: CPU HPA uses observed usage divided by declared CPU
  requests; it does not scale from limits alone.

---

### Exercise 3: The Practical Scaling & Scheduling Lab

**Prediction:** each part of the script tests a different actor: the taint
changes node eligibility, toleration and affinity affect scheduling, load
changes metrics, HPA writes desired replicas, and the Deployment creates Pods.

- **Objective**: Run the comprehensive automated scheduling lab to observe taints, node affinity, and HPA scale-out under real load.
- **Starting Point**: Healthy Stage 7 cluster.
- **Instructions**:

```bash
# Run the verified scaling lab orchestrator
bash stages/stage7/scripts/scaling-lab.sh run
```

- **What This Script Executes Under the Hood**:
  1. Taints `apollo11-worker` with `workload=search:NoSchedule` and labels it `apollo11.io/search-pool=dedicated`.
  2. Recreates `search` Pods so the scheduler evaluates their toleration and
     preferred node affinity. `NoSchedule` prevents new non-tolerating Pods
     from landing there; it does not evict Pods already running on the node.
  3. Lowers the HPA CPU threshold to `10%` and launches in-cluster HTTP load client pods.
  4. Watches `search` replicas **scale out from 1 to 3 replicas** across worker nodes!
  5. Stops the load client and verifies that HPA cleanly **scales in back to baseline** after the stabilization window!
  6. Restores original node labels, taints, and HPA thresholds.

- **Expected result**: The script reports scale-out, at least two distinct
  worker placements, scale-in, and cleanup success.
- **Verification command**: `kubectl get hpa search-hpa -n
  apollo-airlines-apps` shows the original target after the script exits, and
  no `search-load` Deployment remains.
- **Troubleshooting hints**: Run `bash stages/stage7/scripts/scaling-lab.sh
  cleanup` after interruption. The lab requires two nodes labeled
  `node-role=worker` and working metrics-server data.
- **Concept reinforced**: Taints grant/restrict eligibility, affinity affects
  scoring, topology spread affects distribution, and HPA controls count.

---

### Exercise 4: Inspecting VPA Sizing Recommendations

**Question:** does the VPA change the running search Pods? In `Off` mode, it
should publish evidence for a human to review rather than mutate the target.

- **Objective**: Read resource recommendations generated by Vertical Pod Autoscaler.
- **Starting Point**: Stage 7 deployed with the staging or prod values. The dev
  values intentionally set `vpa.search.enabled=false`, so this resource is
  absent in the default local exercise.
- **Instructions**:

```bash
kubectl get vpa search-vpa -n apollo-airlines-apps -o yaml | grep -A 15 recommendation:
```

- **Expected Output**:
  Displays `target`, `lowerBound`, and `uncappedTarget` memory/CPU estimations calculated by the VPA recommender engine!

- **Verification command**: `kubectl describe vpa search-vpa -n
  apollo-airlines-apps` shows `Update Mode: Off` as well as any recommendation.

- **Troubleshooting**: A missing resource in dev is expected. In an enabled
  environment, recommendations can also be absent until the recommender has
  collected enough samples; inspect `kubectl describe vpa search-vpa -n
  apollo-airlines-apps` before treating that as a failure.
- **Concept reinforced**: Recommendation mode produces sizing evidence without
  mutating Pods or competing directly with the CPU-based HPA.

---

## 🏁 What You Learned

- How to implement the cache-aside pattern with Redis and observe `X-Cache` headers and Prometheus metrics.
- How the Horizontal Pod Autoscaler calculates replica counts using CPU utilization percentages.
- Why the "scale fast, contract slow" behavior prevents cluster flapping.
- Why VPA in `Off` mode acts as a safe recommendation advisor without conflicting with HPA.
- How taints repel Pods, tolerations grant permission, and node affinity attracts workloads.

---

## ✈️ Before Continuing: Checkpoint

Before exploring the Cloud Appendix and advanced topics, test your understanding:
1. If an application declares no CPU `requests`, can HPA autoscale it based on CPU utilization?
2. Why is the `scaleDown` stabilization window set to 300 seconds instead of 0 seconds?
3. What is the fundamental difference between a node taint and node affinity?
4. What happens if both HPA and VPA actively mutate CPU on the same Deployment?

Congratulations! You have completed the currently verified **Core Kubernetes
Learning Path** (Ignition through Stage 7). You have packaged, observed, and
scaled a complete microservices platform. Security hardening remains planned
work in Stage 8, so do not describe the Kubernetes deployment as hardened yet.

Now, explore how these concepts translate to real cloud providers like AWS EKS, and review our security and specialization roadmaps!

👉 **Continue to [Cloud Appendix: EKS Research Boundary](./eks)**
