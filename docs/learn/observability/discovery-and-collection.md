---
title: "Discovery and collection"
description: "Understand how Prometheus discovers scrape targets through ServiceMonitors, what the collection chain looks like, and how to diagnose when a metric is missing."
---

# Discovery and collection

*Stage 6 · Mission Operations*

When a metric is missing from a Grafana dashboard, the failure may lie in the application code, the ServiceMonitor target definition, the Prometheus scrape loop, or the PromQL query syntax.

Investigate systematically across the four links in the collection chain.

---

## The Prometheus collection pipeline

~~~mermaid
flowchart LR
  App["booking container\nExposes /metrics on :8082\nGo prometheus/client"] -->|HTTP scrape| Prom["Prometheus\n(scrapes every 30s)"]
  SM["ServiceMonitor\nselects: app=booking\npath: /metrics\nport: http"] -->|configures| Prom
  Prom -->|stores samples| TSDB["Prometheus TSDB\nbooking_requests_total{...}"]
  TSDB -->|query| Grafana["Grafana dashboard\nbooking_requests_total"]
~~~

*Diagram OB-02 — four sequential links: app exposes HTTP endpoint, ServiceMonitor targets service, Prometheus scrapes TSDB, Grafana queries.*

- **1. Application exposure**: Container exposes an HTTP `/metrics` endpoint using standard Prometheus client formats.
- **2. Target discovery**: `ServiceMonitor` custom resources match labels on the application's Kubernetes Service.
- **3. Scrape execution**: Prometheus makes periodic HTTP requests to active endpoint IPs and commits samples to its local TSDB.
- **4. Visualization**: Grafana executes PromQL queries against Prometheus APIs.

---

## ServiceMonitor anatomy and common pitfalls

~~~yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: booking
  namespace: apollo-observability
  labels:
    release: prometheus   # Must match Prometheus Operator's serviceMonitorSelector
spec:
  selector:
    matchLabels:
      app: booking        # Must match labels on the booking Service
  namespaceSelector:
    matchNames:
      - apollo-airlines-apps
  endpoints:
    - port: http          # Must match a named port in the Service spec
      path: /metrics
      interval: 30s
~~~

### The two most frequent configuration errors:
- **Missing release label**: Omitting `release: prometheus` means the Prometheus Operator controller ignores the `ServiceMonitor` completely.
- **Unmatched port name**: The `endpoints[].port` must reference the textual `name:` of the Service port (`http`), not an unmapped number.

---

## Evidence and limits

Diagnose missing metrics from the inside out:

- **1. Application endpoint**: Verify raw metrics output inside the Pod:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/booking -- curl -s http://localhost:8082/metrics | grep booking_requests_total
  ```
- **2. ServiceMonitor selector**: Confirm the ServiceMonitor matches the Service:
  ```bash
  kubectl describe servicemonitor booking -n apollo-observability
  ```
- **3. Prometheus Target status**: Open Prometheus UI (`kubectl port-forward -n apollo-observability svc/prometheus 9090:9090`) and check **Status → Targets** for scrape errors.
- **4. Scrape error metrics**: Check if Prometheus is logging failures:
  ```promql
  up{job="booking"} == 0
  ```
