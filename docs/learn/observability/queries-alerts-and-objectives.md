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
  rate(booking_requests_total{status="200"}[5m])
  ```
- **Error percentage ratio**:
  ```promql
  sum(rate(booking_requests_total{status=~"5.."}[5m]))
  /
  sum(rate(booking_requests_total[5m])) * 100
  ```
- **99th percentile latency**:
  ```promql
  histogram_quantile(0.99, sum by(le) (rate(booking_request_duration_seconds_bucket[5m])))
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
          sum(rate(booking_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(booking_requests_total[5m])) > 0.05
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
  SLO -->|remaining| Budget["Error budget:\n0.5% = ~216 hours/month"]
  Budget -->|consumed by| Incidents["Failed requests,\ndeployments,\nmaintenance"]
  Budget -->|protects| Velocity["Engineering velocity\n(if budget is healthy,\ntry risky changes)"]
~~~

*Diagram OB-05 — error budgets balance deployment velocity against system reliability.*

- **Service Level Indicator (SLI)**: A quantifiable metric measuring service performance:
  - *Example*: Percentage of booking requests returning HTTP 2xx in under 500ms over a 28-day rolling window.
- **Service Level Objective (SLO)**: The agreed target reliability goal:
  - *Example*: 99.5% success rate.
- **Error Budget**: The permitted margin of failure (`100% - SLO`):
  - *Example*: 0.5% failure allowance. If depleted, feature releases pause in favor of reliability engineering.

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
