---
title: "Queries, alerts, and objectives"
description: "Understand how PromQL queries interpret collected samples, how alert rules route signals without repairing anything, and what SLI, SLO, and error budgets mean for Apollo Airlines."
---

# Queries, alerts, and objectives

*Stage 6 · Mission Operations*

Storing time-series samples does not guarantee operational awareness. Operators must turn raw metrics into actionable indicators and alert rules without drowning in notification fatigue.

---

## Core PromQL query patterns

- **Rate calculations (handling counter resets)**:
  ```promql
  rate(http_requests_total{service="booking",status="200"}[5m])
  ```
- **Error percentage ratio**:
  ```promql
  sum(rate(http_requests_total{service="booking",status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total{service="booking"}[5m])) * 100
  ```
- **99th percentile latency (milliseconds)**:
  ```promql
  histogram_quantile(0.99, sum by(le) (rate(http_request_duration_ms_bucket{service="booking"}[5m])))
  ```

---

## Alert rules: routing signals, not performing repairs

An alert rule continuously evaluates a PromQL expression. When the expression evaluates to true for longer than the `for` duration, Prometheus fires an alert to Alertmanager:

~~~yaml
groups:
  - name: apollo.booking
    rules:
      - alert: BookingErrorRateHigh
        expr: |
          sum(rate(http_requests_total{service="booking",status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="booking"}[5m])) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Booking error rate exceeds 5%"
~~~

### Operational rules for alerts:
- **Alerts route messages**: An alert notifies humans (PagerDuty/Slack); it does not automatically scale or restart containers.
- **The `for` duration dampens flapping**: Requiring a 2-minute sustained breach prevents momentary transient spikes from paging engineers at night.

---

## SLIs, SLOs, and Error Budgets

~~~mermaid
flowchart LR
  SLI["SLI: good_requests / total_requests\n(over 28 days)"] -->|compared against| SLO["SLO: 99.5%\n(target)"]
  SLO -->|remaining| Budget["Error budget:\n0.5% of eligible requests"]
  Budget -->|consumed by| Incidents["Failed requests,\ndeployments,\nmaintenance"]
  Budget -->|protects| Velocity["Engineering velocity\n(if budget is healthy,\ntry risky changes)"]
~~~

*Diagram OB-05 — error budgets balance deployment velocity against system reliability.*

- **Service Level Indicator (SLI)**: A quantifiable metric measuring service performance:
  - *Example*: Percentage of eligible POST `/api/bookings` requests returning HTTP 2xx over the observed window, with a 28-day objective. Eligible requests return 2xx or 5xx; client validation and authentication errors are excluded.
- **Service Level Objective (SLO)**: The agreed target reliability goal:
  - *Example*: 99.5% success rate.
- **Error Budget**: The permitted margin of failure (`100% - SLO`):
  - *Example*: 0.5% of eligible requests may fail. A time-based budget would allow 3.6 hours in a 30-day month, but that is a different SLI. If the request budget is depleted, investigate reliability before accepting further rollout risk.

---

## Evidence and limits

- **1. Active Prometheus alert rules**:
  ```bash
  kubectl get prometheusrules -n apollo-observability
  ```
- **2. Alertmanager status**: Check routing and silencing configurations:
  ```bash
  kubectl get pods -n apollo-observability -l app=alertmanager
  ```

## Build, inspect, break, and recover the booking objective

This exercise runs from the verified Stage 6 source at commit
`69113dcc80f77e32301d8ee7b9e73a67c923de96`. Install the baseline, then progress
to the alert/SLO substage:

```bash
cd stages/stage6
bash scripts/apply.sh --without-observability
bash scripts/signals-lab.sh apply 1 helm
bash scripts/signals-lab.sh apply 2 helm
bash scripts/signals-lab.sh apply 3 helm
```

In another terminal, forward Prometheus:

```bash
kubectl --context kind-apollo11 -n apollo-observability port-forward service/prometheus 19090:9090
```

The `apollo-services` PrometheusRule records
`apollo:booking_error_ratio:5m`, `apollo:booking_error_ratio:1h`, and
`apollo:booking_error_ratio:28d`. Query the first recording:

```bash
curl -fsSG --data-urlencode 'query=apollo:booking_error_ratio:5m'   http://localhost:19090/api/v1/query
```

Run `bash scripts/slo-lab.sh`. It proves a successful booking, cancels it,
preserves Flight's replica count, generates 502 booking attempts during a
bounded outage, restores Flight, and proves another booking and cancellation.
It restores Flight on exit if interrupted. Inspect the API error bodies,
recorded error ratio, budget remaining, and pending/firing alert state.

No traffic produces no availability ratio; it must not be interpreted as
perfect service. A 150-second experiment demonstrates short-window burn and
recovery. It cannot prove a 28-day production objective, even though retention
is configured for 30 days. The remaining budget may stay negative after the API
recovers because past failures remain in the observation window.

Explain which requests enter the denominator, why a healthy Pod can coexist
with failed bookings, and why latency and availability are separate objectives.
