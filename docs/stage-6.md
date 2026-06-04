---
title: "Stage 6: Mission Ops — Monitoring and Observability"
description: "Collect metrics with Prometheus, visualize with Grafana, centralize logs with Loki, and trace requests with OpenTelemetry."
---

# Stage 6: Mission Ops — Monitoring and Observability

**Goal:** Set up observability stack to monitor application health, visualize metrics, centralize logs, and trace requests.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| Metrics | Prometheus | Time-series data (CPU, memory, request rates) |
| Dashboards | Grafana | Visualize metrics from Prometheus |
| Log aggregation | Loki + Promtail | Centralized log storage and querying |
| Distributed tracing | OpenTelemetry | Trace requests across microservices |

---

## Prometheus

Prometheus collects metrics by scraping endpoints. Services expose `/metrics` with Prometheus-compatible counters, histograms, and gauges:

- `http_requests_total{method, path, status}` — request counter
- `http_request_duration_ms{method, path}` — latency histogram
- `db_connections_active` — active DB connections (stateful services)

```yaml
scrape_configs:
  - job_name: 'apollo11'
    static_configs:
      - targets: ['identity:8080', 'flight:8081', 'booking:8082', 'search:8083', 'notification:8084']
```

### Metrics Types

| Type | Description | Example |
|------|-------------|---------|
| Counter | Incremental value | `http_requests_total` |
| Gauge | Current value | `memory_usage_bytes` |
| Histogram | Distribution | `request_duration_seconds_bucket` |

---

## Grafana

Grafana connects to Prometheus as a data source and lets you build dashboards. Stage 6 ships a booking service latency dashboard showing p50/p95/p99 response times.

---

## Loki (Log Aggregation)

Loki stores logs and indexes them by labels (not full text). Promtail ships logs from each node.

```logql
{service="identity"} |= "ERROR"
{service="flight"} |= "ERROR"
{service="booking"} |= "ERROR"
```

All services emit structured JSON logs with `trace_id` and `span_id` fields for correlation with OTel traces.

---

## OpenTelemetry (Distributed Tracing)

OpenTelemetry SDK instruments each service to trace requests as they flow through multiple services. Stage 6 traces the booking workflow end-to-end:

```
Booking Service (root span)
    ├── Identity Service: GET /api/users/{id}
    ├── Flight Service: GET /api/flights/{id}
    ├── Flight Service: PATCH /api/flights/{id}/seats
    ├── Booking DB: INSERT bookings
    └── Notification Service: POST /api/notify
```

---

## Key Takeaways

```
Prometheus:   Scrapes /metrics endpoints, stores time-series data
Grafana:      Connects to Prometheus, builds dashboards
Loki:         Aggregates logs, indexes by labels
OpenTelemetry: Traces requests across services (trace_id correlates logs + spans)
```

---

## What's Next

Stage 7 introduces **Orbital Maneuvering** — automatically scaling workloads with HPA/VPA, controlling pod placement with taints/tolerations and affinity.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.