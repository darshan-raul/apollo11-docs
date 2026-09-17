---
title: "Logs"
description: "Understand what makes a log line useful for incident investigation, how Loki collects and indexes Apollo's structured logs, and what a log record can and cannot establish."
---

# Logs

*Stage 6 · Mission Operations*

While metrics indicate *that* an incident is occurring and traces pinpoint *where* latency is accumulating, **logs** surface the explicit application error messages, database exceptions, and contextual event details needed for root-cause diagnosis.

---

## What distinguishes structured logs from unstructured strings

- **Unstructured text (Hard to parse & query)**:
  ```text
  2024-09-18 14:32:01 ERROR booking failed for user 1234: duplicate key
  ```
- **Structured JSON (Queryable, indexed, and correlated)**:
  ```json
  {
    "timestamp": "2024-09-18T14:32:01.423Z",
    "level": "error",
    "service": "booking",
    "trace_id": "abc123traceidentifier",
    "operation": "CreateBooking",
    "booking_reference": "AA-2024-001234",
    "error": "pq: duplicate key value violates unique constraint \"bookings_booking_reference_key\"",
    "duration_ms": 45
  }
  ```

### Key advantages of structured fields:
- **Trace correlation**: Embedding `trace_id` enables jumping directly from a Tempo trace span into the exact matching log lines in Grafana.
- **LogQL filtering**: Allows querying by specific operational codes without fragile regex matching.

---

## Apollo's log ingestion pipeline

~~~mermaid
flowchart LR
  Booking["booking container\nstdout: JSON log lines"] -->|Container stdout| CRI["Container runtime\n(containerd writes to node log file)"]
  CRI -->|Node filesystem| Alloy["Grafana Alloy\n(DaemonSet, one per node)\nDiscovery: Kubernetes pod labels"]
  Alloy -->|Loki push API| Loki["Loki\n(log store, indexed by labels)"]
  Loki -->|LogQL query| Grafana["Grafana Explore\napp=booking, error"]
~~~

*Diagram OB-04 — containers print to stdout; containerd captures logs to disk; Grafana Alloy discovers, annotates with Pod labels, and ships to Loki.*

- **Stdout standard**: Applications print directly to standard output.
- **Node agent**: Grafana Alloy runs as a DaemonSet, scraping container log paths on the host node.
- **Metadata enrichment**: Alloy attaches Kubernetes metadata (`namespace`, `app`, `pod`) as stream labels before shipping to Loki.

---

## Log retention rules: what to log vs. what to redact

- **Always include**:
  - `trace_id` and `span_id`.
  - Functional error reasons and exception types.
  - Safe business identifiers (order numbers, flight codes).
- **Never include (Security violations)**:
  - Raw JWT tokens or passwords.
  - Credit card numbers, CVVs, or passenger PII.

---

## Evidence and limits

- **1. Direct container output**: Check unbuffered application stdout:
  ```bash
  kubectl logs -n apollo-airlines-apps deploy/booking --tail=50
  ```
- **2. Query Loki via LogQL**: Filter errors in Grafana Explore:
  ```logql
  {app="booking", namespace="apollo-airlines-apps"} |= "error" | json | level="error"
  ```
- **3. Search by booking reference**:
  ```logql
  {app="booking"} |= "AA-2024-001234"
  ```
