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
  Passenger["Passenger: 'My booking was slow'"] --> Metric["Metric\nIs this widespread?\nbooking_request_duration_seconds\np99 spike at 14:30"]
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

- **Counters (`booking_requests_total`)**:
  - Monotonically increasing values starting from `0`.
  - Resets to `0` when container restarts.
  - Query as rates: `rate(booking_requests_total[5m])` (requests per second).
- **Histograms (`booking_request_duration_seconds`)**:
  - Samples durations into configurable buckets (`le="0.05"`, `le="0.5"`, `le="+Inf"`).
  - Enables percentile calculations: `histogram_quantile(0.99, ...)` (p99 tail latency).

---

## High-cardinality label hazards

- **Safe low-cardinality labels**: `status="200"`, `method="POST"`, `service="booking"`.
- **Dangerous high-cardinality labels**: `user_id`, `booking_id`, `request_id`.
  - *Why*: Multiplying hundreds of thousands of user IDs creates millions of distinct Prometheus time series, exhausting TSDB memory and crashing Prometheus. Put high-cardinality identifiers in logs and traces, never metric labels.

---

## Evidence and limits

- **1. Target scrape health**: Ensure Prometheus is scraping metrics:
  ```bash
  kubectl get servicemonitor -n apollo-observability
  ```
- **2. Query live rates**: Test PromQL expressions via curl or Prometheus UI:
  ```bash
  rate(booking_requests_total{status="200"}[5m])
  ```
- **3. Check percentile latencies**: Inspect p99 latency distributions:
  ```bash
  histogram_quantile(0.99, sum by(le) (rate(booking_request_duration_seconds_bucket[5m])))
  ```
