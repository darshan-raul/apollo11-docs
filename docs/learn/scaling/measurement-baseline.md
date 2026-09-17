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

Execute a scripted benchmark and export summary metrics:

```bash
# 1. Capture un-optimized baseline
k6 run stages/stage7/k6/search.js --summary-export baseline-summary.json

# 2. Introduce optimization (e.g. Redis caching)

# 3. Capture post-optimization benchmark
k6 run stages/stage7/k6/search.js --summary-export optimized-summary.json

# 4. Compare quantitative distributions
diff <(jq '.metrics' baseline-summary.json) <(jq '.metrics' optimized-summary.json)
```
