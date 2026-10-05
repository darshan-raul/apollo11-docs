---
title: "Signals and metrics"
description: "Understand why metrics, logs, and traces answer different questions, how counters and histograms differ, and what makes a metric actionable vs misleading."
---

# Signals and metrics

*Stage 6 · Mission Operations*

When passengers report elevated booking latency, an average response time of 120ms hides the reality: 99% of passengers experience 50ms responses, while 1% suffer through 5-second timeouts. 

Observability requires pairing the right signal with the right operational question.

---

## Three telemetry pillars

~~~mermaid
flowchart LR
  Passenger["Passenger: 'My booking was slow'"] --> Metric["Metric\nIs this widespread?\nhttp_request_duration_ms\np99 spike at 14:30"]
  Metric --> Trace["Trace\nWhere did time go?\nflight span: 340ms"]
  Trace --> Log["Log\nWhat happened in flight?\nERROR: db connect timeout 14:31:55"]
  Log --> Root["Root cause:\nflight DB connection pool exhausted"]
~~~

*Diagram OB-01 — metrics establish fleet scope, traces locate distributed bottlenecks, and logs surface root-cause event details.*

| Signal | Question it answers | Best used for |
|---|---|---|
| **Metrics** | Is the system experiencing a widespread issue? | Aggregating rates, errors, and latencies across millions of requests |
| **Traces** | Where was latency incurred for one specific request? | Pinpointing slow microservice hops across distributed systems |
| **Logs** | What exact error occurred in the process runtime? | Reading specific error messages, stack traces, and query failures |

---

## Counters vs. Histograms

- **Counters (`http_requests_total`)**:
  - Monotonically increasing values starting from `0`.
  - Resets to `0` when container restarts.
  - Query as rates: `rate(http_requests_total{service="booking"}[5m])` (requests per second).
- **Histograms (`http_request_duration_ms`)**:
  - Samples durations in milliseconds into configurable buckets (`le="50"`, `le="500"`, `le="+Inf"`).
  - Enables percentile calculations: `histogram_quantile(0.99, ...)` (p99 tail latency).

---

## High-cardinality label hazards

- **Safe low-cardinality labels**: `status="200"`, `method="POST"`, `service="booking"`.
- **Dangerous high-cardinality labels**: `user_id`, `booking_id`, `request_id`.
  - *Why*: Multiplying hundreds of thousands of user IDs creates millions of distinct Prometheus time series, exhausting TSDB memory and crashing Prometheus. Put high-cardinality identifiers in logs and traces, never metric labels.

---

## Evidence and limits

- **1. Discovery configuration**: Inspect ServiceMonitors, then confirm actual targets in the Prometheus UI:
  ```bash
  kubectl get servicemonitor -n apollo-observability
  ```
- **2. Query live rates**: Test PromQL expressions via curl or Prometheus UI:
  ```promql
  rate(http_requests_total{service="booking",status="200"}[5m])
  ```
- **3. Check percentile latencies**: Inspect p99 latency distributions:
  ```promql
  histogram_quantile(0.99, sum by(le) (rate(http_request_duration_ms_bucket{service="booking"}[5m])))
  ```
