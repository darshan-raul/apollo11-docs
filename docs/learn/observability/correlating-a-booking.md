---
title: "Correlating a booking"
description: "Walk through a complete observability investigation for a slow or failing booking request, connecting metrics, traces, and logs as complementary evidence."
---

# Correlating a booking

*Stage 6 · Mission Operations*

When a customer reports that ticket checkout took 8 seconds and returned an error, an on-call engineer must systematically narrow the problem from cluster-wide health down to specific lines of code.

---

## The 4-step triage methodology

~~~mermaid
flowchart TD
  Step1["1. Metric: p99 spike at 14:30\nAffected 12% of booking requests\nDuration: 4 minutes"] --> Step2
  Step2["2. Trace: abc123\nbooking: 8043ms (ERROR)\nflight/CheckSeat: 7980ms (TIMEOUT)"] --> Step3
  Step3["3. Log: flight service\ndb query > 8000ms deadline\nquery: CheckSeatAvailability"] --> Step4
  Step4["4. Root cause hypothesis:\nflight DB overloaded at 14:30\nCheck: kubectl top pod flight-db\nCheck: flight-db query volume"] --> Confirm["5. Confirm:\nflight-db CPU spike in Grafana\nDB connection pool exhausted\n→ Root cause confirmed"]
~~~

*Diagram OB-07 — moving from fleet scope (metric) to distributed bottleneck (trace) to application context (log) to root cause.*

- **Step 1: Metric Scope Check**:
  - Determine if the issue affected a single user or all passengers.
  - Query Prometheus p99 latency and 5xx error rates around the incident timestamp.
- **Step 2: Distributed Trace Inspection**:
  - Retrieve the `Trace ID` for the affected booking.
  - Inspect span breakdowns in Grafana Tempo.
  - Identify that the `flight/CheckSeat` span consumed 7.9 seconds of the 8.0-second total duration.
- **Step 3: Target Service Log Search**:
  - Query Loki logs in the `flight` namespace for that exact `Trace ID`.
  - Locate explicit log event: `context deadline exceeded: db query took > 8000ms`.
- **Step 4: Infrastructure Verification**:
  - Check `flight-db` resource utilization and database connection pool saturation metrics in Prometheus.

---

## Practical diagnostic commands

- **Find trace ID from booking reference in logs**:
  ```bash
  kubectl logs -n apollo-airlines-apps deploy/booking | grep "AA-2024-001234" | jq .trace_id
  ```
- **Inspect span tree via Tempo API**:
  ```bash
  curl -s "http://localhost:3100/api/traces/<trace-id>" | jq '.batches[].scopeSpans[].spans[] | {service: .name, duration_ms: (.endTimeUnixNano - .startTimeUnixNano | . / 1000000), status: .status}'
  ```
- **Query flight database connection saturation**:
  ```promql
  flight_db_pool_connections_used / flight_db_pool_connections_max * 100
  ```
