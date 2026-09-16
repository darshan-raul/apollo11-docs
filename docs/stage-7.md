---
title: "Stage 7 — Orbital Maneuvering: Autoscaling & Scheduling"
description: "Master Redis cache-aside, Horizontal Pod Autoscaling (HPA v2), Vertical Pod Autoscaler (VPA), node taints, tolerations, and affinity."
sidebar_label: "Stage 7: Scaling & Scheduling"
---

# Stage 7: Orbital Maneuvering — Autoscaling & Scheduling

In previous stages, our replica counts were static. If thousands of holiday travelers suddenly search for flights, our search service would saturate its CPU limits and drop requests. Conversely, running 10 replicas overnight when traffic is zero wastes expensive compute resources.

In **Stage 7 (Orbital Maneuvering)**, we make Apollo Airlines **elastic and cache-friendly**:
1. **Redis Cache-Aside**: We introduce a high-performance caching layer into the `search` service, serving flight availability queries from memory with observable `X-Cache: HIT/MISS` headers.
2. **Horizontal Pod Autoscaler (HPA v2)**: We scale `search` replicas dynamically between 2 and 10 based on CPU utilization metrics supplied by `metrics-server`.
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

## ⚡ 1. The Cache-Aside Pattern with Redis

The `search` service is the highest-volume read path in Apollo Airlines. Every time a customer searches for flights between two cities, `search` queries `flight`. Because flight schedules change infrequently, querying the relational database for every single search is inefficient.

### The Request Flow
When a search request arrives:
1. **Key Generation**: Build a deterministic cache key:
   `search:{origin}:{destination}:{date}` (e.g. `search:BOM:SIN:2026-06-17`).
2. **Cache Lookup**: Query Redis (`GET search:...`).
   - **Cache HIT**: Return the cached JSON payload immediately. Add the HTTP response header `X-Cache: HIT`, and increment the Prometheus counter `cache_hits_total{service="search"}`.
   - **Cache MISS**: Forward the request to `flight`. Store the response in Redis with a 5-minute Time-To-Live (`SETEX key 300 value`), add `X-Cache: MISS`, and increment `cache_misses_total`.
3. **Graceful Degradation**:
   If Redis crashes or fails to respond within 1 second, the `search` service logs a warning, falls back to querying `flight` directly, and serves the user. **A cache outage must never fail customer search requests!**

---

## 📈 2. Horizontal Pod Autoscaler (HPA v2)

The **Horizontal Pod Autoscaler** continuously queries the Kubernetes Metrics API (`metrics.k8s.io` supplied by `metrics-server`) and adjusts the `.spec.replicas` field of a target Deployment.

### The Autoscaling Formula
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

:::important Requests Are Mandatory for HPA!
HPA calculates CPU utilization as a percentage of the container's **CPU `requests`**. If a Deployment does not declare `resources.requests.cpu`, HPA cannot compute utilization and will report `TARGETS: <unknown>`!
:::

### Dissecting `search-hpa.yaml`

*Source: `stages/stage7/helm/apollo11/templates/autoscaling/search-hpa.yaml`*

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

### The "Scale Fast, Contract Slow" Principle:
- **`scaleUp`**:
  `stabilizationWindowSeconds: 0`. When traffic spikes, scale immediately! The policy allows doubling replicas (`100%`) or adding `4` pods every 30 seconds.
- **`scaleDown`**:
  `stabilizationWindowSeconds: 300` (5 minutes). When traffic drops, the HPA waits 5 minutes before terminating pods. This prevents **flapping** (rapidly creating and destroying pods if traffic fluctuates intermittently).

---

## 📊 3. Vertical Pod Autoscaler (VPA) in `Off` Mode

While HPA adjusts the *number* of Pods (horizontal scaling), the **Vertical Pod Autoscaler (VPA)** adjusts the *size* of Pods (changing CPU/memory requests and limits).

### Why VPA and HPA Must Not Fight!
If HPA is scaling Pod count based on CPU utilization, and VPA simultaneously changes the CPU request of those Pods, the two controllers enter an unstable feedback loop:
1. VPA increases CPU request from `100m` to `200m`.
2. This doubles the denominator in HPA's utilization formula!
3. HPA sees utilization cut in half and immediately terminates replicas.
4. The remaining replicas experience higher load, causing VPA to increase requests again!

### The Solution: Recommendation Mode
In Stage 7, VPA is deployed with:
```yaml
spec:
  updateMode: "Off"
```
In `Off` mode, VPA monitors live container usage and publishes statistical recommendations (`Target`, `LowerBound`, `UpperBound`) without evicting or modifying Pods. It acts as an advisory tool for human capacity planning!

---

## 🧭 4. Advanced Scheduling: Taints, Tolerations & Affinity

Kubernetes gives operators fine-grained control over which worker nodes execute specific workloads:

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

## 🧪 Hands-On Guided Exercises

### Exercise 1: Deploy Stage 7 & Verify Redis Cache Hits

- **Objective**: Deploy Stage 7 and verify `X-Cache` response headers.
- **Starting Point**: Running `kind-apollo11` cluster.
- **Instructions**:

```bash
cd Apollo11

# 1. Deploy Stage 7 in Helm dev mode
bash stages/stage7/scripts/apply.sh --env dev

# 2. Query search via Envoy Gateway (First call: Cache MISS)
curl -i -H "Host: search.apollo.local" "http://172.18.0.50/api/search?origin=BOM&destination=DEL&date=2026-06-20" | grep "X-Cache"
# Output: X-Cache: MISS

# 3. Query the EXACT SAME route immediately (Second call: Cache HIT)
curl -i -H "Host: search.apollo.local" "http://172.18.0.50/api/search?origin=BOM&destination=DEL&date=2026-06-20" | grep "X-Cache"
# Output: X-Cache: HIT
```

- **What Concept This Reinforces**:
  The first request queried `flight` and stored the payload in Redis (`MISS`). The second request returned the result in less than 2 milliseconds directly from Redis memory (`HIT`)!

---

### Exercise 2: Inspecting HPA and Metrics Server

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

---

### Exercise 3: The Practical Scaling & Scheduling Lab

- **Objective**: Run the comprehensive automated scheduling lab to observe taints, node affinity, and HPA scale-out under real load.
- **Starting Point**: Healthy Stage 7 cluster.
- **Instructions**:

```bash
# Run the verified scaling lab orchestrator
bash stages/stage7/scripts/scaling-lab.sh run
```

- **What This Script Executes Under the Hood**:
  1. Taints `apollo11-worker` with `workload=search:NoSchedule` and labels it `apollo11.io/search-pool=dedicated`.
  2. Restarts `search` pods: observes that `search` pods successfully land on the dedicated tainted node due to their tolerations, while non-search pods are kept away!
  3. Lowers the HPA CPU threshold to `10%` and launches in-cluster HTTP load client pods.
  4. Watches `search` replicas **scale out from 1 to 3 replicas** across worker nodes!
  5. Stops the load client and verifies that HPA cleanly **scales in back to baseline** after the stabilization window!
  6. Restores original node labels, taints, and HPA thresholds.

---

### Exercise 4: Inspecting VPA Sizing Recommendations

- **Objective**: Read resource recommendations generated by Vertical Pod Autoscaler.
- **Starting Point**: Cluster with VPA active (staging/prod mode).
- **Instructions**:

```bash
kubectl get vpa search-vpa -n apollo-airlines-apps -o yaml | grep -A 15 recommendation:
```

- **Expected Output**:
  Displays `target`, `lowerBound`, and `uncappedTarget` memory/CPU estimations calculated by the VPA recommender engine!

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

Congratulations! You have completed the **Core Kubernetes Learning Path** (Ignition through Stage 7). You have built, hardened, packaged, observed, and scaled a complete microservices platform!

Now, explore how these concepts translate to real cloud providers like AWS EKS, and review our security and specialization roadmaps!

👉 **Continue to [Cloud Appendix: Amazon EKS Prototype](./eks)**
