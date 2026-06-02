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

Prometheus collects metrics by scraping endpoints. Configure your apps to expose `/metrics`.

```yaml
scrape_configs:
  - job_name: 'apollo11'
    static_configs:
      - targets: ['auth:8080']
```

### Metrics Types

| Type | Description | Example |
|------|-------------|---------|
| Counter | Incremental value | `http_requests_total` |
| Gauge | Current value | `memory_usage_bytes` |
| Histogram | Distribution | `request_duration_seconds` |

---

## Grafana

Grafana connects to Prometheus as a data source and lets you build dashboards.

---

## Loki (Log Aggregation)

Loki stores logs and indexes them by labels (not full text). Promtail ships logs from each node.

```logql
{service="auth"} |= "ERROR"
```

---

## OpenTelemetry (Distributed Tracing)

Trace requests as they flow through multiple services.

---

## Key Takeaways

```
Prometheus:   Scrapes /metrics endpoints, stores time-series data
Grafana:      Connects to Prometheus, builds dashboards
Loki:         Aggregates logs, indexes by labels
OpenTelemetry: Traces requests across services
```

---

## What's Next

Stage 7 introduces **Orbital Maneuvering** — automatically scaling workloads with HPA/VPA, controlling pod placement.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.