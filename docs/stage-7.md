---
title: Stage 7 — Orbital Maneuvering
description: Add measurable Redis caching, horizontal and vertical scaling, and observable scheduling policy.
---

# Stage 7 — Orbital Maneuvering

Stage 7 makes the platform elastic without hiding the evidence. Search uses a cache-aside Redis design; HPA changes replica count from CPU utilization; VPA recommends resources in `Off` mode; the scaling lab makes taints, affinity, and topology spread visible.

## Build

```bash
cd Apollo11
bash stages/stage7/scripts/apply.sh --env dev
bash stages/stage7/scripts/verify.sh
```

Use staging/prod values when studying VPA; dev intentionally disables it. The script installs metrics-server before dependent HPA resources and installs VPA outside dev.

## Concepts: cache-aside and autoscaling

Cache-aside means the application checks Redis first, reads the source on a miss, then writes the result with a TTL. It must define key shape, staleness, invalidation, cardinality, and failure behavior. Apollo11 search treats Redis as an optimization: a Redis outage should not make the user request fail.

HPA reads a metric through the metrics API and adjusts a target Deployment between `minReplicas` and `maxReplicas`. CPU utilization is calculated relative to resource requests. `behavior.scaleUp` and `scaleDown` control how quickly it reacts. VPA `updateMode: Off` observes history and writes recommendations without evicting Pods; it is a measurement tool here, not automatic resizing.

### Cache-aside, in detail

Search is the right teaching workload because its result can be recomputed from Flight data. The request path is:

1. Build a bounded key from origin, destination, and date.
2. Ask Redis for the key.
3. On a hit, return the cached response and record a hit metric.
4. On a miss, call Flight, store the result with a five-minute TTL, and return it.
5. If Redis times out, log the cache failure and continue to the source of truth.

```text
search:BOM:SIN:2026-06-17 -> {result} EX 300
```

The key must include every input that changes the result. Omitting date could return an old day's availability. Including unbounded arbitrary query text can create a huge keyspace. A TTL bounds staleness but does not solve immediate invalidation after a seat change. In a real system, Flight events or explicit invalidation would be needed for stronger freshness.

Redis is an optimization in this stage, not the source of truth. That design choice determines failure behavior: cache loss is acceptable, losing PostgreSQL booking data is not. The application uses short timeouts and graceful degradation so a slow cache cannot consume every request goroutine.

### How HPA decides to scale

HPA periodically reads the current metric, compares it with the target, and computes a desired replica count. For CPU utilization, the percentage is relative to Pod CPU requests. A Pod with no request cannot provide a meaningful utilization percentage for the usual resource metric. HPA then changes the target Deployment's `.spec.replicas`; the Deployment/ReplicaSet controllers create or remove Pods.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
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
    scaleDown:
      stabilizationWindowSeconds: 300
```

Scaling up quickly and scaling down slowly reduces the chance of oscillation. HPA cannot fix a slow database, a saturated external dependency, or an application with no useful parallelism. More replicas may amplify load against a downstream system.

Conceptually, the HPA computes a desired replica estimate from current usage and target usage. If two replicas request 100m CPU each and average 140m, utilization is 70%; that is at target. If average usage rises to 210m, utilization is 105%, so the controller asks for more replicas subject to min/max and stabilization rules. This is an approximate control loop with delayed measurements, not an instantaneous autoscaling switch.

The target Deployment remains the owner of Pods. HPA only changes the replica field. If another system writes that same field—an imperative command, Helm upgrade, Kustomize apply, or Argo CD self-heal—the writers can fight. Decide which controller owns replicas for the experiment and inspect the owner/reference chain.

Metrics-server supplies resource metrics through the metrics API. Prometheus metrics do not automatically become HPA metrics; that requires the appropriate adapter and API. This distinction explains why Prometheus can show traffic while `kubectl top` or HPA has no CPU samples.

### HPA diagnosis

```bash
kubectl describe hpa search -n apollo-airlines-apps
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/apollo-airlines-apps/pods | head
kubectl top pods -n apollo-airlines-apps
kubectl get deployment search -n apollo-airlines-apps \
  -o jsonpath='{.spec.template.spec.containers[0].resources}{"\n"}'
```

Read HPA conditions such as `AbleToScale`, `ScalingActive`, and `ScalingLimited`. A blank `TARGETS` value usually means the metric path is unavailable or the target has no usable requests. A stable replica count may be correct if load is below target or a stabilization window is active.

### VPA recommendations are evidence

VPA observes historical usage and recommends target, lower-bound, and upper-bound resource values. `updateMode: Off` means it does not modify Pods. This is deliberate: automatic VPA updates can evict/recreate workloads and interact with HPA in confusing ways. Inspect recommendations over enough workload history before deciding whether requests are too high or too low.

The target recommendation is not “the amount of memory the application needs forever.” It is a statistical observation under the traffic and limits seen by the recommender. The lower and upper bounds express uncertainty. A recommendation made during an idle lab is not a production capacity plan. Compare recommendations against request/limit policy, node capacity, latency, and failure behavior.

HPA and VPA can conflict when both adjust the same resource dimensions: HPA uses utilization relative to requests while VPA changes requests, changing the denominator that HPA observes. This stage keeps VPA in recommendation mode so the learner can reason about the data without introducing an automatic control-loop interaction.

### Scheduling experiment semantics

The scaling lab labels a worker, adds a reversible taint, applies a toleration and preferred affinity to Search, and generates traffic. The result demonstrates a policy under actual capacity, not merely YAML parsing. Remove labels and taints in teardown. If a Pod lands elsewhere, that may be correct: preferred affinity is a scoring hint, and topology spread balances eligible nodes rather than obeying a single-node command.

### Scaling is not reliability by itself

More replicas help only when the workload is horizontally scalable and its dependencies can handle the added concurrency. Stateful databases may need connection pooling, read replicas, or sharding instead. A cache can reduce source load but introduce stale data. A fast HPA can create a thundering herd against a recovering dependency. A slow scale-down can waste resources, while an aggressive scale-down can terminate useful warm caches.

Always pair a scaling experiment with saturation and user signals: request rate, error rate, latency, CPU, memory, cache hit ratio, database connections, and queue depth. If CPU falls but latency rises, the bottleneck moved. If replicas grow while errors grow, scaling amplified a dependency failure.

Scheduling policy has separate meanings: a **toleration** permits a Pod onto a tainted node; **affinity** prefers or requires nodes; **topology spread** balances replicas across domains. None of these alone guarantees placement.

## Prove cache behavior

```bash
bash stages/stage7/scripts/trace-test.sh
# Or query search twice using the in-cluster command documented by the source README.
kubectl get pods -n apollo-airlines-apps -l app=search -o wide
kubectl get hpa -A
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes | head
kubectl get vpa -A
```

The first identical search should be a `MISS`, the second a `HIT`; inspect `cache_hits_total` and `cache_misses_total`. The key format is `search:{origin}:{destination}:{date}` and TTL is five minutes. Redis failure should degrade search rather than make the user request fail.

To interpret the result correctly, check all four layers: the response's `X-Cache` header, the Redis key/TTL, the application counters, and the trace attributes. A `HIT` header without a changing counter suggests instrumentation drift; a counter without a Redis key suggests the test is not exercising the expected code path.

## Break and recover

Run the reversible scheduling/load lab:

```bash
bash stages/stage7/scripts/scaling-lab.sh
```

Observe HPA scale-out under load, replica distribution across workers, and scale-in after load stops. If you manually stop Redis, compare search behavior and cache metrics, then restore Redis and verify hits return. A populated HPA `TARGETS` column is evidence that metrics-server and resource requests are working together.

When HPA does not move, distinguish these cases: metrics-server has no samples; the HPA target has no CPU requests; load is below the target; the Deployment has reached a bound; or the controller is still within its stabilization window. `kubectl describe hpa` shows conditions and events. Do not manually scale the Deployment while trying to understand HPA—the controller will overwrite the experiment.

### Cache failure matrix

| Redis state | Expected search behavior | Evidence |
| --- | --- | --- |
| Healthy, key absent | Read Flight, return result, write key | `MISS`, miss counter, `cache.set` span |
| Healthy, key present | Return cached result | `HIT`, hit counter, `cache.get` span |
| Slow/unreachable | Read Flight or return bounded dependency error | timeout log, no hung request |
| Restarted | Cold cache, then repopulation | miss spike followed by hits |
| Stale key | Fast but old result | TTL/key policy; correctness test required |

This matrix is the reason “Redis is Running” is not the cache lesson. The learner needs to observe the application contract under each state.

## Stage 7 checkpoint questions

1. Why is cache-aside different from making Redis the source of truth?
2. What makes a cache key complete, bounded, and safe to expire?
3. Which API supplies HPA CPU metrics, and why is Prometheus alone not enough?
4. How do CPU requests affect HPA utilization?
5. Why is VPA in `Off` mode for this lab?
6. What is the difference between a toleration, affinity, and topology spread constraint?
7. When can adding replicas make an outage worse?

## Gotchas

- HPA needs metrics-server and meaningful resource requests; `kubectl get hpa` alone is not proof of scaling.
- A cache hit is not always correct: define invalidation and bounded staleness before production.
- VPA recommendations need history and are weak on a fresh local cluster.
- A toleration is permission, not preference; affinity is preference/eligibility, not a capacity guarantee.
- Teardown order matters because VPA webhooks can block deletion; use the source script.

```bash
bash stages/stage7/scripts/teardown.sh
```

This completes the runnable spine. Read the [EKS appendix](./eks) only when you are ready to spend cloud resources.
