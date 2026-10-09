---
title: "Signals and metrics"
description: "Metrics, logs and traces answer different questions; counters, histograms and the cardinality rule."
---

# Signals and metrics

*Stage 6 · Mission Operations*

**You will be able to:** pick the right signal for a question, read a counter and a histogram query, and avoid the label mistake that crashes Prometheus.

A passenger says "booking was slow". Kubernetes tells you Pods are Ready and the Deployment is available, which is true and useless: it says nothing about how long requests took, which service was slow, or what error occurred. Systems must produce **evidence about their behaviour**, and different questions need different kinds of evidence.

## Three signals, three questions

A doctor uses different instruments for different questions: a **thermometer reading over days** (is this widespread, and getting worse?), a **scan of one patient** (where exactly is the problem?), and the **patient's notes** (what happened, in words?).

| Signal | Answers | Strength | Apollo tool |
|---|---|---|---|
| **Metric** | Is this widespread? How much, how fast, what fraction failed? | Cheap summaries over huge numbers of requests | Prometheus |
| **Trace** | Where did time go in **this one** request? | The path across services, with timings | Tempo |
| **Log** | What exactly happened inside this process? | Specific messages and errors | Loki |

They work as a funnel: metrics show *that* and *since when*, a trace shows *where*, and a log shows *why*.

```mermaid
flowchart LR
  P["'My booking was slow'"] --> M[Metric: p99 spike at 14:30]
  M --> T[Trace: flight span 340 ms]
  T --> L[Log: db connect timeout 14:31:55]
```

An **average** hides the tail. If 99% of requests take 50 ms and 1% take 5 s, the average is about 100 ms, which looks fine while one passenger in a hundred waits five seconds. That is why we use percentiles.

## Counters and histograms

Prometheus collects numeric series over time. Two shapes matter most:

| | Counter | Histogram |
|---|---|---|
| Example | `http_requests_total` | `http_request_duration_ms_bucket{le="50"}` |
| Behaviour | Only increases; resets to 0 when the process restarts | Counts how many requests fell into each duration bucket |
| Query with | `rate(x[5m])` (per-second rate over 5 minutes) | `histogram_quantile(0.99, …)` (a percentile) |

Because a counter's raw value is just a running total, you almost always ask for its **rate** over a window.

```promql
rate(http_requests_total{service="booking"}[5m])
histogram_quantile(0.99, sum by(le) (rate(http_request_duration_ms_bucket{service="booking"}[5m])))
```

## The cardinality rule

A metric is identified by its name plus its **labels** (key/value tags such as `service="booking"`). Every distinct combination of labels is a separate time series that Prometheus must store.

| Safe (few distinct values) | Dangerous (unbounded) |
|---|---|
| `service`, `status`, `method` | `user_id`, `booking_id`, `request_id` |

Labelling with `booking_id` would create a new series per booking, millions in time, exhausting memory. Put per-request identifiers in **logs and traces**, where they belong.

## Try it

```bash
kubectl get servicemonitor -n apollo-observability
kubectl port-forward -n apollo-observability svc/prometheus 19090:9090 &
curl -sG localhost:19090/api/v1/query --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (service)' | jq .
```

- A service with no recent traffic simply has no rate; that does not mean Prometheus is broken.

## Common misconceptions

- **"Average latency tells me about passengers."** Look at p95/p99.
- **"More labels means better metrics."** Unbounded labels break the system.
- **"A metric tells me which request failed."** That needs a trace or a log.

## Check yourself

<details>
<summary>Why not label a metric with <code>booking_id</code>?</summary>

Each booking would create a new time series, exploding memory. Use logs and traces for per-request IDs.
</details>

## Where this leads

Signals exist only if the code produces them and something carries them out of the Pod. Next: [How signals leave a service](./instrumenting-services).
