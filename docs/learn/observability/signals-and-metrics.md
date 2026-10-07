---
title: "Signals and metrics"
description: "Metrics, logs and traces answer different questions; counters, histograms and the cardinality rule."
---

# Signals and metrics

*Stage 6 · Mission Operations*

**You will be able to:** pick the signal for a question, query a counter and a histogram, and avoid high-cardinality labels.

## Three signals

| Signal | Answers | Strength | Apollo tool |
|---|---|---|---|
| **Metric** | Is this widespread? How much, how fast, what fraction failed? | Cheap aggregation over many requests | Prometheus |
| **Trace** | Where did time go in **this** request? | Cross-service path and timing | Tempo |
| **Log** | What exactly happened in this process? | Error messages, details | Loki |

```mermaid
flowchart LR
  P["'My booking was slow'"] --> M[Metric: p99 spike at 14:30]
  M --> T[Trace: flight span 340 ms]
  T --> L[Log: db connect timeout 14:31:55]
```

- An **average** hides the tail: 99% at 50 ms and 1% at 5 s averages ~100 ms.

## Counters and histograms

| | Counter | Histogram |
|---|---|---|
| Example | `http_requests_total` | `http_request_duration_ms_bucket{le="50"}` |
| Behaviour | Only increases; resets to 0 on restart | Counts per duration bucket |
| Query with | `rate(x[5m])` (per second) | `histogram_quantile(0.99, …)` |

```promql
rate(http_requests_total{service="booking"}[5m])
histogram_quantile(0.99, sum by(le) (rate(http_request_duration_ms_bucket{service="booking"}[5m])))
```

## Label cardinality

| Safe (few values) | Dangerous (unbounded) |
|---|---|
| `service`, `status`, `method` | `user_id`, `booking_id`, `request_id` |

- Every distinct label combination is a **separate time series**. Unbounded labels exhaust Prometheus memory.
- Put per-request identifiers in **logs and traces**.

## Try it

```bash
kubectl get servicemonitor -n apollo-observability
kubectl port-forward -n apollo-observability svc/prometheus 19090:9090 &
curl -sG localhost:19090/api/v1/query --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (service)' | jq .
```

## Gotchas

- Empty result ≠ broken Prometheus: no recent traffic gives no rate.
- A rate needs a window; `[5m]` smooths short spikes.

## Check yourself

<details>
<summary>Why not label a metric with <code>booking_id</code>?</summary>

Each booking would create a new time series, exploding memory. Use logs/traces for per-request IDs.
</details>
