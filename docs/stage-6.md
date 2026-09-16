---
title: "Stage 6: Mission Operations — Observability"
description: "Instrument Apollo Airlines with Prometheus metrics, OpenTelemetry distributed tracing with Tempo, Loki log aggregation via Alloy, and Grafana dashboards."
---

# Stage 6: Mission Operations — Observability

**Goal:** Make Apollo Airlines completely observable across the **three pillars of observability** (Metrics, Logs, and Traces) without modifying its public API contracts.

Stage 6 instruments the five backend microservices (`identity`, `flight`, `booking`, `search`, `notification`) with real Prometheus metrics, structured JSON logs containing trace correlation IDs, and OpenTelemetry SDK tracing. The observability infrastructure is deployed into a dedicated `apollo-observability` namespace.

| | |
|---|---|
| **Pillars Covered** | Metrics (Prometheus), Dashboards (Grafana), Logs (Loki + Alloy), Distributed Tracing (OpenTelemetry + Tempo) |
| **New Platform Tools** | Prometheus Operator v0.93.0, Prometheus v3.13.1, Grafana 10.4.2, OpenTelemetry Collector Contrib, Tempo 2.3.1, Loki 2.9.8, Alloy v1.18.0 |
| **Telemetry Instrumentation** | Real `/metrics` counters/histograms, W3C `traceparent` propagation, `trace_id`/`span_id` in logs, OTLP gRPC export |
| **Verification Target** | **190 Helm checks / 180 Kustomize checks / 4 Argo CD Applications** |

---

## 1. Application Telemetry Architecture

Every microservice is instrumented to emit telemetry across all three signals:

```mermaid
flowchart TD
    subgraph Apollo Airlines Services
        App["Microservice (Go / Python)"]
    end

    subgraph Observability Platform (apollo-observability)
        Prom["Prometheus v3.13.1<br/>(Scrapes /metrics via ServiceMonitor)"]
        Alloy["Grafana Alloy v1.18.0<br/>(DaemonSet collecting JSON logs)"]
        Loki["Grafana Loki v2.9.8<br/>(Log Storage & LogQL)"]
        OTel["OpenTelemetry Collector<br/>(OTLP gRPC receiver :4317)"]
        Tempo["Grafana Tempo v2.3.1<br/>(Trace Storage & TraceQL)"]
        Grafana["Grafana 10.4.2<br/>(Unified Visual Dashboards)"]
    end

    App -->|1. Exposes /metrics| Prom
    App -->|2. Emits JSON logs with trace_id| Alloy
    Alloy --> Loki
    App -->|3. Exports OTLP Spans| OTel
    OTel --> Tempo

    Prom --> Grafana
    Loki --> Grafana
    Tempo --> Grafana
```

### 1. Prometheus Metrics
The services expose real metrics endpoints at `/metrics`:
- `http_requests_total{method, path, status, service}`: Counter tracking total HTTP requests.
- `http_request_duration_ms_bucket{method, path, service}`: Histogram tracking latency distribution (p50, p95, p99).
- `db_connections_active`: Gauge tracking live PostgreSQL database connections.

Prometheus Operator manages five `ServiceMonitor` CRDs that instruct Prometheus to scrape these endpoints every 15 seconds.

### 2. Distributed Tracing & W3C Context Propagation
When a user books a flight, the request traverses four distinct services. Stage 6 propagates the W3C `traceparent` header across every hop:

```text
Booking Service (Root Span: POST /api/bookings)
    ├── Identity Service: GET /api/users/me (validates JWT)
    ├── Flight Service: GET /api/flights/{id} (checks seat availability)
    ├── Flight Service: PATCH /api/flights/{id}/seats (reserves seat)
    ├── PostgreSQL: INSERT INTO bookings
    └── Notification Service: POST /api/notify (queues event in Redis)
```

Every service adds child spans with custom semantic attributes (`flight.id`, `passenger.id`, `db.statement`).

### 3. Log Correlation (trace_id & span_id)
Microservices format stdout logs as structured JSON containing active OpenTelemetry trace metadata:

```json
{
  "timestamp": "2026-08-25T14:32:10Z",
  "level": "INFO",
  "service": "booking",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "message": "Booking confirmed for flight AA101"
}
```

In Grafana, clicking on a log line allows you to immediately jump to the exact distributed trace in Tempo using the correlated `trace_id`!

---

## 2. Observability Platform Components

All monitoring components run in the `apollo-observability` namespace:

| Component | Role | Why It Was Chosen |
|---|---|---|
| **Prometheus Operator v0.93.0** | Operator managing Prometheus & ServiceMonitors | Declarative CRD-based monitoring lifecycle |
| **Prometheus v3.13.1** | Time-series metrics engine | CNCF standard for cloud-native metrics collection |
| **Grafana 10.4.2** | Visualization UI | 5 pre-configured dashboards; exposed via Envoy Gateway at `grafana.apollo.local` |
| **OpenTelemetry Collector** | Ingestion pipeline | Buffers, batches, and exports OTLP telemetry |
| **Tempo 2.3.1** | Distributed trace store | Lightweight, object-storage-friendly tracing without Elasticsearch |
| **Loki 2.9.8** | Log store | Indexes metadata labels rather than full text, keeping memory usage low |
| **Alloy v1.18.0** | Per-node log shipper | Grafana's modern collector; replaces end-of-life Promtail |

:::tip Operator Bundle Separation
Prometheus Operator CRDs and controller are installed from `bundles/prometheus-operator-v0.93.0.yaml` rather than embedded inside Helm templates. This prevents Helm's release Secret from exceeding Kubernetes' 1 MiB storage limit.
:::

---

## 3. Hands-On Lab: Deploy Stage 6

### Option A: Deploy via Helm

```bash
cd stages/stage6

# Apply dev environment with full observability
bash scripts/apply.sh --mode helm --env dev
```

### Option B: Deploy via Kustomize

```bash
cd stages/stage6
bash scripts/apply.sh --mode kustomize --env dev
```

The script builds updated service images containing OpenTelemetry instrumentation, installs the Prometheus Operator, and deploys the entire observability stack.

---

## 4. Explore the Telemetry Signals

### 1. Access Grafana Through Envoy Gateway

Find the Envoy LoadBalancer IP and test the Grafana health endpoint:

```bash
ENVOY_IP=$(kubectl get service -n envoy-gateway-system \
  -l gateway.envoyproxy.io/owning-gateway-name=apollo-gateway \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}')

curl -H "Host: grafana.apollo.local" "http://${ENVOY_IP}/api/health"
# Returns: {"commit":"...","database":"ok","version":"10.4.2"}
```

Add `grafana.apollo.local` to `/etc/hosts` pointing to `${ENVOY_IP}`, or open `http://grafana.apollo.local` in your browser:
- **Username:** `admin`
- **Password:** `apollo-admin`

Inspect the 5 pre-provisioned dashboards:
1. **Apollo Airlines / Overview:** Cluster-wide traffic rates and success ratios.
2. **Apollo Airlines / Latency:** p50, p95, and p99 latency per service.
3. **Apollo Airlines / Errors:** 4xx and 5xx error tracking.
4. **Apollo Airlines / Saturation:** CPU, memory, and database connection pool saturation.
5. **Apollo Airlines / JVM & Go Runtime:** Garbage collection pauses and goroutine counts.

### 2. Direct Port-Forwarding (Alternative)

```bash
# Prometheus Web UI (targets, query console)
kubectl port-forward -n apollo-observability service/prometheus 9090:9090 &

# Grafana Web UI
kubectl port-forward -n apollo-observability service/grafana 3000:3000 &
```

Open [http://localhost:9090/targets](http://localhost:9090/targets) to verify that all 5 Apollo ServiceMonitors are `UP`.

---

## 5. The Distributed Trace Demonstration

Apollo11 includes an end-to-end distributed tracing test script:

```bash
bash scripts/trace-test.sh
```

### What the Script Executes:
1. Authenticates as `passenger@apolloairlines.com` and retrieves a JWT.
2. Calls `POST /api/bookings` to reserve a flight.
3. Extracts the unique `trace_id` returned in the response headers.
4. Queries the **Tempo API** directly:
   ```bash
   curl -s "http://tempo.apollo-observability:3200/api/traces/${TRACE_ID}"
   ```
5. Asserts that the single trace contains connected spans across **all 4 services**: `booking`, `identity`, `flight`, and `notification`.
6. Cancels the booking and verifies that the internal seat-restore rollback span succeeds.

---

## Maintainer Verification

Run the verification test suite:

```bash
# Helm verification (190 checks)
bash scripts/verify.sh --mode helm

# Kustomize verification (180 checks)
bash scripts/verify.sh --mode kustomize
```

**Verification Highlights:**
- Prometheus Operator CRDs and 5 healthy ServiceMonitors verified.
- Active metric generation: validates that request counters increase under load.
- OpenTelemetry Collector, Tempo, Loki, and Alloy pods report `Running`.
- Alloy successfully collects container logs and ships them to Loki.
- Tempo successfully indexes multi-service distributed traces.
- All Stage 5 guarantees (probes, QoS, PDBs, StatefulSets) remain intact.

---

## Clean Up

```bash
# Helm teardown
bash scripts/teardown.sh --mode helm --env dev --purge

# Kustomize teardown
bash scripts/teardown.sh --mode kustomize --env dev --purge
```

---


### OTEL Trace Propagation Path

When a user makes a booking, the W3C trace context is propagated downstream:
1. **Frontend (NGINX/Browser):** Generates `traceparent` (in Stage 8 RUM, currently uninstrumented).
2. **Booking Service:** Receives request, initiates active OTEL span.
3. **Identity Service:** Booking calls Identity to verify `is_active=true`. `traceparent` is injected.
4. **Flight Service:** Booking calls Flight to patch `available_seats`. `traceparent` is injected.
5. **Notification Service:** Booking calls Notification to dispatch email. `traceparent` is injected.

To verify this from `verify.sh`:
```bash
EG_IP=$(kubectl get svc -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=apollo-gateway -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}')
TOKEN=$(curl -s -X POST "http://${EG_IP}/api/users/login" -H "Host: identity.apollo.local" -H "Content-Type: application/json" -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -r .token)
REQ_ID="stage6-verify-trace-001"

curl -s -X POST "http://${EG_IP}/api/bookings" -H "Host: booking.apollo.local" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -H "X-Request-ID: ${REQ_ID}" -d '{"flightId":"...uuid..."}'

# Check Loki for the propagated logs across multiple services:
kubectl exec -n apollo-observability deploy/loki -- logcli query '{namespace="apollo-airlines-apps"} | json | x_request_id="'${REQ_ID}'"'
```


## Explain & Review Questions

1. **What is the difference between a Prometheus Counter and a Gauge?**
   A **Counter** is a cumulative metric that only increases (or resets to 0 on restart), such as `http_requests_total`. A **Gauge** is an instantaneous value that can go up and down, such as `db_connections_active` or memory usage.

2. **Why does distributed tracing require W3C `traceparent` header propagation?**
   HTTP is stateless. When `booking` calls `flight`, `flight` has no intrinsic knowledge that it is servicing a sub-task of a booking transaction unless `booking` passes its `trace_id` and parent `span_id` in the HTTP headers.

3. **Why did Grafana Alloy replace Promtail for log shipping?**
   Promtail is end-of-life. Alloy is Grafana's unified, high-performance telemetry agent based on the OpenTelemetry Collector architecture, supporting metrics, logs, and traces in a single binary.

---

## What's Next

In [Stage 7: Orbital Maneuvering](./stage-7.md), we use these observability metrics to drive **dynamic autoscaling**: horizontal pod autoscaling with HPA, vertical right-sizing recommendations with VPA, and database acceleration with a **Redis cache-aside** pattern.