---
title: "Queries, alerts, and objectives"
description: "PromQL patterns, alert rules that notify rather than repair, and SLI/SLO/error budget for booking."
---

# Queries, alerts, and objectives

*Stage 6 · Mission Operations*

**You will be able to:** write the three core queries, say what an alert does and does not do, and compute an error budget.

## The problem

Raw samples sitting in a database do not help at 3 a.m. You need to turn them into answers ("how many bookings are failing?"), into a notification when something is wrong, and into an agreed definition of "good enough" so teams can decide whether to ship risky changes or fix reliability.

## The idea in plain words

**Queries** ask questions of stored data. **Alerts** are queries that run continuously and tap a human on the shoulder. **Objectives** are promises about how good service should be, measured by those same queries.

### Three core PromQL patterns

```promql
rate(http_requests_total{service="booking",status="200"}[5m])          # requests per second

sum(rate(http_requests_total{service="booking",status=~"5.."}[5m]))
  / sum(rate(http_requests_total{service="booking"}[5m])) * 100        # error percentage

histogram_quantile(0.99, sum by(le) (rate(http_request_duration_ms_bucket{service="booking"}[5m])))   # p99 latency
```

### Alerts notify; they do not repair

An alert rule evaluates a query on a schedule. When the condition has held for the `for` duration, Prometheus fires the alert to Alertmanager, which routes it to Slack or a pager. Nothing is scaled or restarted. The `for` delay stops momentary spikes from waking someone.

```yaml
- alert: BookingErrorRateHigh
  expr: sum(rate(http_requests_total{service="booking",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="booking"}[5m])) > 0.05
  for: 2m
  labels: {severity: warning}
```

An alert moves through `inactive → pending → firing`.

## How it works: SLI, SLO and error budget

Three terms turn "reliable" into numbers:

| Term | Meaning | Apollo booking |
|---|---|---|
| **SLI** (indicator) | The measured quantity | Good ÷ eligible `POST /api/bookings`. Eligible = responses that are 2xx or 5xx. **4xx are excluded** because they are caller mistakes (wrong password), not service failures |
| **SLO** (objective) | The target for the SLI | 99.5% over 28 days |
| **Error budget** | The allowed failure | 0.5% of eligible requests. Remaining = `1 − error_ratio / 0.005`, which can go negative |

```mermaid
flowchart LR
  SLI --> SLO[99.5%] --> Budget[0.5% budget] --> Use{budget healthy?}
  Use -->|yes| Ship[take rollout risk]
  Use -->|no| Fix[invest in reliability]
```

The budget makes a trade-off explicit: while it is healthy, take risks and ship faster; once it is spent, prioritise reliability.

*Source: the `PrometheusRule` records `apollo:booking_error_ratio:{5m,1h,28d}` and `apollo:booking_error_budget_remaining:28d`. The alert `ApolloBookingErrorBudgetBurn` fires when both a short and a long window burn the budget faster than 14.4 times the allowed rate for two minutes.*

## Limits to respect

- **No traffic means no ratio.** The series is absent. It is not "100% available".
- A 150-second drill shows burn and recovery, but **cannot prove a 28-day objective** on a new cluster.
- The remaining budget can stay negative after the API recovers, because past failures stay in the window.
- Latency and availability are separate objectives: a latency bucket cannot say whether a request succeeded.

## Try it

```bash
cd stages/stage6 && bash scripts/signals-lab.sh apply 3 helm
curl -sG localhost:19090/api/v1/query --data-urlencode 'query=apollo:booking_error_ratio:5m'
bash scripts/slo-lab.sh        # bounded outage; restores Flight on exit
```

## Common misconceptions

- **"An alert fixes the problem."** It only notifies.
- **"Healthy Pods mean the SLO is fine."** Failures can come from dependencies on the request path.
- **"Errors should include all non-200s."** Client mistakes do not count against the service.

## Check yourself

<details>
<summary>Why exclude 4xx from the booking SLI?</summary>

They are caller errors (bad password, invalid input), not service failures.
</details>

<details>
<summary>Can a healthy Pod coexist with a burning budget?</summary>

Yes. Pod readiness says the process is up; failures can come from dependencies on the request path.
</details>

## Where this leads

Metrics say how much. Logs say what happened. Next: how Apollo's logs are produced and found.
