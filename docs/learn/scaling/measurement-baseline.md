---
title: "Measurement before optimization"
description: "Understand how to design a repeatable performance baseline, why a single faster response is not a result, and what a useful performance comparison requires."
---

# Measurement before optimization

*Stage 7 · Orbital Maneuvering*

Before introducing Redis caching or enabling autoscalers to resolve latency issues in Apollo's search service, you must establish a repeatable, quantifiable performance baseline. 

An anecdote like *"it felt faster on my laptop"* is not engineering evidence.

---

## The five pillars of an engineering baseline

~~~mermaid
flowchart TD
  subgraph Baseline["Baseline definition (before any change)"]
    W["1. Workload shape\nRequest rate, concurrency, distribution\n(k6 load test: 50 VU, 2 min)"]
    E["2. Environment\nCluster size, node type, other tenants\n(kind cluster, 2 workers, no competing load)"]
    M["3. Success metrics\nWhat must improve?\n(p99 latency < 500ms at 50 RPS)"]
    S["4. Saturation signals\nWhat might become the bottleneck?\n(CPU, memory, DB connections, network)"]
    T["5. Time window\nWhen does the measurement apply?\n(2-minute steady-state window)"]
  end
~~~

*Diagram SC-01 — a scientific baseline requires all five elements before comparing optimization results.*

- **1. Workload profile**: Synthetic load generator (e.g. k6) running fixed virtual users (VUs) and arrival rates.
- **2. Controlled environment**: Known worker node sizing, zero unmetered background processes.
- **3. Quantitative success criteria**: Specific thresholds (e.g. `p99 < 500ms at 50 RPS`).
- **4. Saturation signals**: Tracking secondary bottlenecks (database connection pools, node CPU saturation).
- **5. Steady-state window**: Measuring across a sustained 2-to-5 minute window rather than transient bursts.

---

## Why a single curl measurement is misleading

Testing with `curl -o /dev/null -s -w '%{time_total}'` tests only a single happy-path packet. It fails to surface:
- **Tail latency spikes**: What happens when 100 concurrent requests compete for database connections.
- **Cold start delays**: Latency during initial cache warming or JVM JIT compilation.
- **Error cascading**: Latencies that appear fast only because downstream calls failed immediately.

---

## Repeatable load testing with k6

This lab runs against Apollo11 commit `69113dcc80f77e32301d8ee7b9e73a67c923de96`,
which includes the `k6/search.js` test suite and the Search service `CACHE_ENABLED`
environment switch. Run from the Apollo11 repository root and verify:

```bash
test -f stages/stage7/k6/search.js
grep -n CACHE_ENABLED stages/stage7/code/search/main.go
```

Follow `stages/stage7/k6/README.md` for the exact experiment. It saves the HPA,
replica count, and cache setting, pauses autoscaling, then compares explicit
`CACHE_ENABLED=false` and `CACHE_ENABLED=true` runs at one replica. Exit recovery
restores the saved state. Keep a dedicated port-forward terminal:

```bash
kubectl --context kind-apollo11 -n apollo-airlines-apps port-forward service/search 18083:8083
```

After the guide disables caching and waits for the rollout:

```bash
BASE_URL=http://localhost:18083 EXPECT_CACHE=off \
  k6 run --summary-export baseline-summary.json stages/stage7/k6/search.js
```

After enabling caching and waiting for the replacement Pods, restart the
port-forward if necessary and run:

```bash
BASE_URL=http://localhost:18083 EXPECT_CACHE=on \
  k6 run --summary-export optimized-summary.json stages/stage7/k6/search.js
jq '.metrics | {http_req_duration, http_req_failed, checks, cache_hit_rate, dropped_iterations}' \
  baseline-summary.json optimized-summary.json
```

The workload sends 50 requests/second for two minutes across six seeded routes
in deterministic order. Setup warms those keys outside the measured scenario.
It requires nonempty flight results, successful response checks, no dropped
iterations, and the expected cache behavior. Record the UTC search date, image,
revision plus patch, node capacity, Pod CPU, and request rate alongside each
summary. Use the same values for both runs.

The localhost HTTP path deliberately bypasses edge TLS for both measurements.
To measure the Gateway instead, use the same trusted HTTPS origin for both runs
and record that route choice. Do not mix direct-Service and edge timings.

## Interpret and recover

A larger hit ratio is evidence that the cache served requests. It does not
establish a latency improvement: compare p95, failures, achieved throughput,
and CPU. A small local dataset may show no worthwhile improvement. Report that
result without weakening the thresholds or replacing it with one fast curl.

If setup finds no seeded flights, inspect seed Jobs and the database date range.
Set `SEARCH_DATE` to a seeded UTC date or reseed the persistent database. If
checks fail, inspect response bodies before interpreting latency. If iterations
are dropped, the load generator failed to sustain the intended workload.

Exit the experiment's Bash terminal to restore the HPA and cache setting. Prove
recovery with a populated search response and an active HPA. Explain which
variable changed, why warming is separate from measurement, and what evidence
would justify enabling caching for this workload.
