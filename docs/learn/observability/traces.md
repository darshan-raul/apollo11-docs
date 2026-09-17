---
title: "Distributed traces"
description: "Understand how a trace connects spans across Apollo's microservices, what W3C traceparent propagation requires, and why a trace is strong evidence for where time was spent but not proof of root cause."
---

# Distributed traces

*Stage 6 · Mission Operations*

A single passenger booking request cascades through multiple microservices: the frontend calls `booking`, `booking` verifies authentication with `identity`, checks seat locks in `flight`, and writes to `booking-db`. 

When the entire call takes 8 seconds, **distributed tracing** visualizes the exact timeline of execution across all participating services.

---

## Anatomy of a trace: traces and spans

~~~mermaid
sequenceDiagram
  participant B as booking (span)
  participant I as identity (span)
  participant F as flight (span)
  participant DB as booking-db (span)
  Note over B: Trace ID: abc123\nTotal: 680ms
  B->>I: POST /api/auth/validate\ntrace parent: abc123-B
  I-->>B: 200 OK (12ms)
  B->>F: GET /api/flights?seat=14A\ntrace parent: abc123-B
  F-->>B: 200 OK (340ms)
  B->>DB: INSERT INTO bookings\ntrace parent: abc123-B
  DB-->>B: OK (5ms)
  Note over F: flight span: 340ms\nflight called flight-db: 290ms
~~~

*Diagram OB-03 — a distributed trace correlates cross-service spans under a shared trace ID.*

- **Trace**: A directed acyclic graph (DAG) representing the complete journey of a request. Identified by a unique `Trace ID`.
- **Span**: A discrete block of time spent within one specific service or sub-operation:
  - Carries a `Span ID`, `Parent Span ID`, start time, duration, and metadata tags (e.g. `http.status_code: 200`, `db.statement`).

---

## Context propagation: the W3C `traceparent` standard

For spans across separate network boundaries to assemble into a single trace, services must forward HTTP context headers:

- **The `traceparent` header format**:
  ```text
  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  ```
  - `00`: Protocol version.
  - `4bf92...`: Global Trace ID.
  - `00f06...`: Calling Parent Span ID.
  - `01`: Trace flags (sampling enabled).
- **Silent failure modes**:
  - If a service drops the header during an outgoing HTTP client call, downstream spans lose their parent link and appear as fragmented, unrelated root traces.

---

## The OpenTelemetry Collector architecture

- **Applications**: Emit spans over OTLP (OpenTelemetry Protocol) via gRPC (`:4317`) or HTTP (`:4318`).
- **OTel Collector DaemonSet**: Runs on each worker node to receive, batch, and compress telemetry data locally.
- **Backend Store (Grafana Tempo)**: Receives batched traces for indexing and high-throughput query lookups.

---

## Evidence and limits

- **1. Extract trace ID from live request**:
  ```bash
  curl -v http://localhost:30082/api/bookings -d '{"flight_id":"F101"}' 2>&1 | grep -i "X-Trace-Id"
  ```
- **2. Query trace in Tempo API**:
  ```bash
  curl -s "http://localhost:3100/api/traces/<trace-id>" | jq .
  ```
- **3. Collector health**: Ensure OpenTelemetry collector is exporting spans:
  ```bash
  kubectl logs -n apollo-observability -l app=otel-collector | grep -E "Exporting|spans"
  ```
