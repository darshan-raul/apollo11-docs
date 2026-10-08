---
title: "Stage 6 — Mission Operations: Observability & Tracing"
description: "Add metrics, dashboards, a booking SLO, logs and traces one signal at a time, and understand what each one answers that the others cannot."
sidebar_label: "Stage 6: Mission Ops (Observability)"
---

# Stage 6: Mission Operations

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage6`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: the Stage 5 Helm chart and the `kind-apollo11` cluster. Tear down Stage 5 first. Namespaces: `apollo-airlines-apps`, `apollo-airlines-ui`, and new `apollo-observability`. Allow about 8 GB of free RAM.
- Concepts behind this stage: [Signals and metrics](./learn/observability/signals-and-metrics) · [Discovery and collection](./learn/observability/discovery-and-collection) · [Queries, alerts and objectives](./learn/observability/queries-alerts-and-objectives) · [Logs](./learn/observability/logs) · [Distributed traces](./learn/observability/traces) · [Correlating a booking](./learn/observability/correlating-a-booking)
:::

:::caution[Verification status]
`stages/stage6/SIGNALS.md` describes this ordered path as implemented, noting that a clean end-to-end lifecycle run is still required before it replaces the older all-in-one installer (`apply.sh --mode helm --env dev`). If a step here differs from what you see, trust the output and record it.
:::

## Where we left off

- **Stage 4** made every Pod say whether it is alive and ready, and gave it CPU and memory requests.
- **Stage 5** packaged all of it as a Helm chart (with a Kustomize alternative), with one values file per environment, and let Argo CD keep the cluster equal to Git.
- So we can now deploy Apollo the same way every time. But we still cannot answer the question operations actually gets asked:

  > *"Is booking healthy for passengers right now, and if not, why?"*

- Today the only tools are:
  - **`kubectl get pods`**: tells you a Pod is Running and Ready. It says nothing about how many bookings fail.
  - **`kubectl logs`**: one Pod at a time, and only while that Pod exists. A replaced Pod takes its history with it.
  - **`/metrics`**: in Stage 5 it returns placeholder JSON (`"http_requests_total": 0`). There is nothing to count.
- A booking crosses four services: booking → identity → flight → notification. When it is slow, there is no way to see which hop took the time.

Stage 6 adds the three signals that answer these questions:

- **Metric:** a number over time ("what fraction of bookings failed in the last 5 minutes?").
- **Log:** a line of text from one service at one moment ("what did booking say?").
- **Trace:** the path of *one* request through every service, with timings ("where did this booking spend its time?").

## What changes in this stage

| Concern | Stage 5 | Stage 6 | Why it's better |
|---|---|---|---|
| What the code emits | `/metrics` placeholder JSON; the log field `trace_id` actually holds the `X-Request-ID` | Real Prometheus counters and histograms; OpenTelemetry spans; `trace_id` in log lines | The apps now produce data worth collecting |
| Collecting metrics | Nothing | **Prometheus**, run by the **Prometheus Operator**, finds apps through **ServiceMonitors** | Scrapes every backend every 30 s and keeps 30 days of history |
| Looking at metrics | `curl` one Pod | **Grafana** with five provisioned dashboards | Shared views across all services, over time |
| "Is booking OK?" | A judgement call | **Booking SLO** as recording rules plus a burn-rate alert | Health becomes a number: error ratio and remaining error budget |
| Logs | `kubectl logs`, one Pod, lost with the Pod | **Alloy** on every node ships logs to **Loki** | Search all services at once, after Pods are gone |
| Following one request | Not possible | **OpenTelemetry Collector** forwards spans to **Tempo** | One booking shows as one trace across four services |
| Joining signals | — | Shared `trace_id` in spans and log lines | Go from "error rate rose" to "this request" to "what the service said" |
| Delivery | Three Argo CD Applications | Four: dev/staging/prod plus one shared `apollo11-observability` | The shared observability namespace is owned once, not three times |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `code/{booking,flight,search,notification}/main.go`, `code/identity/main.py` | Same services, now instrumented: Prometheus metrics, OpenTelemetry tracing, `traceparent` on outbound calls | Replaces Stage 5's code (which had placeholder `/metrics`) |
| `bundles/prometheus-operator-v0.93.0.yaml` | Operator CRDs and controller | New. Kept outside the chart so Helm's release Secret stays under Kubernetes' 1 MiB object limit |
| `helm/apollo11/templates/observability/` | Prometheus, ServiceMonitors, rules, Grafana + dashboards, Loki + Alloy, Tempo, OTel Collector, Grafana HTTPRoute | New |
| `helm/apollo11/templates/apps/*.yaml` | App templates: Service gains an `app` label and a named `http` port; Pods get `OTEL_*` env vars | Changed from Stage 5 |
| `helm/apollo11/values.yaml` | New `observability:` block (images, retention, storage, resources) | Extends Stage 5's values |
| `overlays/` | Plain-manifest Kustomize path, now including observability | Same role as Stage 5 |
| `argocd/applications/observability.yaml` | Fourth Argo CD Application for the shared stack | New |
| `scripts/apply.sh` | Installer. `--without-observability` installs only the Stage 5-compatible baseline | Extends Stage 5's |
| `scripts/signals-lab.sh`, `select-signals.py` | Add the signals one at a time (substages 1–6) | New |
| `scripts/slo-lab.sh` | A bounded, self-restoring booking outage | New |
| `scripts/trace-test.sh` | Makes a booking and checks for one trace across four services | New |
| `SIGNALS.md` | The ordered signal path this page follows | New |

## Walkthrough

Set the context once. Every Stage 6 script refuses to run against any other context.

```bash
export KUBE_CONTEXT=kind-apollo11
```

### Step 1: Install the baseline, and see what the code now emits

```bash
bash stages/stage6/scripts/apply.sh --without-observability
kubectl get ns | grep apollo                          # no apollo-observability yet
kubectl exec -n apollo-airlines-apps deploy/search -- \
  wget -qO- http://127.0.0.1:8083/metrics | grep '^http_requests_total' | head -3
```

The apps are instrumented already. Only the collectors are missing. The key part of [`booking/main.go`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/code/booking/main.go):

```go
// booking/main.go (trimmed)
httpRequestsTotal = prometheus.NewCounterVec(
    prometheus.CounterOpts{Name: "http_requests_total"},
    []string{"service", "method", "path", "status"},   // labels: small, fixed sets of values
)
httpRequestDurationMs = prometheus.NewHistogramVec(
    prometheus.HistogramOpts{Name: "http_request_duration_ms",
        Buckets: []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000}},
    []string{"service", "method", "path"},
)
// metricsMiddleware runs after every request:
path := c.FullPath()            // the route pattern, e.g. /api/bookings/:id, not the real ID
httpRequestsTotal.WithLabelValues(service, c.Request.Method, path, status).Inc()
```

- **What happens:** every request adds 1 to a counter and drops its duration into a histogram bucket. `/metrics` shows the current totals in Prometheus text format.
- **Why labels are route patterns:** each distinct label value creates a separate time series. A booking ID as a label would create one series per booking. IDs belong in logs and traces, not metrics.
- **Why the Service changed too:** Stage 6 gives each app Service an `app: <name>` label and names its port `http`. The ServiceMonitor in Step 2 selects on exactly those two things.
- **Compared with Stage 5:** `/metrics` returned `{"http_requests_total": 0, ...}` as JSON. Nothing could scrape it. The deployment layer didn't change, the code did.
- **Still missing:** right now you can still only `kubectl logs` one Pod and `curl` one `/metrics`. Each step below adds one signal.

### Step 2: Metrics: let Prometheus find and scrape the apps

```bash
bash stages/stage6/scripts/signals-lab.sh render 1 helm | grep -E '^kind:' | sort | uniq -c   # look first, changes nothing
bash stages/stage6/scripts/signals-lab.sh apply 1 helm
kubectl port-forward -n apollo-observability svc/prometheus 19090:9090 >/dev/null 2>&1 &
curl -s localhost:19090/api/v1/targets | jq -r '.data.activeTargets[] | "\(.labels.job) \(.health)"' | sort
```

[`signals-lab.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/scripts/signals-lab.sh) installs the Operator bundle, then applies the observability objects for the chosen substage. Two objects do the work:

```yaml
# servicemonitors/booking-sm.yaml
kind: ServiceMonitor
metadata:
  labels: {app.kubernetes.io/part-of: apollo-airlines}   # Prometheus selects monitors by this label
spec:
  selector: {matchLabels: {app: booking}}   # which Service(s)
  namespaceSelector: {any: true}            # the Service lives in apollo-airlines-apps
  endpoints:
    - port: http                            # the named port added in Step 1
      path: /metrics
      interval: 30s
---
# prometheus/deployment.yaml
kind: Prometheus                            # a custom resource; the Operator turns it into a StatefulSet
spec:
  serviceMonitorSelector:
    matchLabels: {app.kubernetes.io/part-of: apollo-airlines}
  retention: "30d"
  storage: {volumeClaimTemplate: ...}       # metrics survive a Prometheus restart (Stage 3's PVCs again)
```

- **What happens:** the Operator watches ServiceMonitors, writes Prometheus's scrape config from them, and Prometheus scrapes each matching Service's endpoints every 30 s. You should see five targets `up`: booking, flight, identity, notification, search.
- **Why a ServiceMonitor, not a list of URLs:** Pods come and go. A ServiceMonitor selects by label, exactly like a Service selects Pods in Stage 1. New Pods are scraped without anyone editing config.
- **Annotations too:** the chart also adds `prometheus.io/scrape` annotations to Pods. This Operator-managed Prometheus does not read them. ServiceMonitors are what it uses.
- **Watch out:** a ServiceMonitor object is a *request* to scrape. It proves nothing on its own. Only a target `up` with samples advancing proves collection:

```bash
curl -sG localhost:19090/api/v1/query \
  --data-urlencode 'query=sum by (service) (rate(http_requests_total[2m]))' | jq -r '.data.result[] | "\(.metric.service) \(.value[1])"'
```

- An idle service may be missing from that result. No traffic is not the same as broken. The [discovery chapter](./learn/observability/discovery-and-collection) covers the full selector chain.
- **Compared with Stage 5:** the first time Apollo has history. "What was booking's request rate ten minutes ago?" now has an answer.

### Step 3: Dashboards: a view, not a store

```bash
bash stages/stage6/scripts/signals-lab.sh apply 2 helm
kubectl port-forward -n apollo-observability svc/grafana 13000:3000 >/dev/null 2>&1 &
curl -s localhost:13000/api/health
```

Open `http://localhost:13000` (`admin` / `apollo-admin`, from `observability.grafana` in [`values.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/helm/apollo11/values.yaml)). Grafana is also routed through the Stage 2 Envoy Gateway at `grafana.apollo.local`.

| Dashboard (folder `Apollo11`) | Shows |
|---|---|
| Apollo Overview | Targets up, requests/s and p95 latency per service |
| Booking Service | Booking p50/p95/p99, error rate, requests by status code |
| Service Errors | 5xx and 4xx rates and error % per service |
| Service Runtime | Process CPU and resident memory per target |
| Trace Viewer | Recent booking traces from Tempo |

- **What happens:** Grafana sends PromQL to Prometheus and draws the answer. Dashboards and datasources are ConfigMaps in the chart, so every install gets the same views.
- **Why it matters that Grafana stores nothing:** if Grafana is down, no data is lost. Prometheus keeps scraping. The reverse also holds: a healthy dashboard can show an empty panel when no samples exist.
- **Watch out:** the Loki and Tempo datasources are already configured, but Loki and Tempo are not installed until Steps 5 and 6. A configured datasource proves nothing about whether that signal works.

### Step 4: Turn "is booking OK?" into a number

```bash
bash stages/stage6/scripts/signals-lab.sh apply 3 helm
curl -s localhost:19090/api/v1/rules | jq -r '.data.groups[].rules[] | "\(.type) \(.name)"' | sort -u
```

First, two terms:

- **SLO (service level objective):** a target for how often something should work. Here: **99.5% of eligible booking-creation requests succeed**.
- **Error budget:** the 0.5% that may fail. Spending it faster than planned is the warning sign.

The rules are in [`prometheus/rules.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/helm/apollo11/templates/observability/prometheus/rules.yaml):

```yaml
# group apollo.booking-slo (trimmed)
- record: apollo:booking_error_ratio:5m      # also :1h and :28d
  expr: |
    (sum(rate(http_requests_total{service="booking",method="POST",path="/api/bookings",status=~"5.."}[5m])) or vector(0))
    / sum(rate(http_requests_total{service="booking",method="POST",path="/api/bookings",status=~"2..|5.."}[5m]))
    and sum(rate(...same eligible requests...[5m])) > 0   # no traffic -> no value, not "100% fine"
- record: apollo:booking_error_budget_remaining:28d
  expr: 1 - apollo:booking_error_ratio:28d / 0.005      # negative = overspent; not clamped
- alert: ApolloBookingErrorBudgetBurn
  expr: apollo:booking_error_ratio:5m > (14.4 * 0.005) and apollo:booking_error_ratio:1h > (14.4 * 0.005)
  for: 2m
```

- **What a recording rule is:** a query Prometheus evaluates every 30 s and stores as a new series. Dashboards and alerts read `apollo:booking_error_ratio:5m` instead of repeating the long expression.
- **Why 4xx are excluded:** "eligible" means 2xx or 5xx. A wrong password or a sold-out flight (`409 No seats available`) is the service working correctly. Only server failures spend budget.
- **Why "no traffic" is empty, not zero:** with no bookings the ratio is undefined. Reporting it as 100% would hide an outage that also stops traffic.
- **Why two windows in the alert:** the 5-minute window reacts quickly. The 1-hour window confirms it isn't a blip. 14.4× is the burn speed that would use the whole budget far too early. The [objectives chapter](./learn/observability/queries-alerts-and-objectives) explains burn rates.
- **The other rules:** `ApolloServiceDown` (`up == 0` for 2 m), `ApolloErrorRateHigh` (5xx above 5% per service), `ApolloBookingLatencyP95High` (p95 above 500 ms).

Now see the number move. Read [`slo-lab.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/scripts/slo-lab.sh) first: it saves flight's replica count, scales flight to 0, sends real booking attempts for 150 s (each gets a 502), restores flight, then makes and cancels one recovery booking. It restores flight on exit even if interrupted.

```bash
Q() { curl -sG localhost:19090/api/v1/query --data-urlencode "query=$1" | jq -c '.data.result'; }
Q 'apollo:booking_error_ratio:5m'                 # before: [] (no bookings yet)
bash stages/stage6/scripts/slo-lab.sh
Q 'apollo:booking_error_ratio:5m'                 # near 1 during and just after the outage
Q 'apollo:booking_error_budget_remaining:28d'     # negative
curl -s localhost:19090/api/v1/alerts | jq -r '.data.alerts[] | "\(.labels.alertname) \(.state)"'
```

- **What you see:** the 5-minute ratio jumps toward 1, the budget goes negative, and `ApolloBookingErrorBudgetBurn` goes `pending` then `firing`. Minutes later the 5-minute ratio falls; the 1-hour and 28-day ratios fall slowly.
- **Why a drill can't prove the SLO:** a fresh cluster has minutes of history. The 28-day window only *looks* like a monthly number.
- **Where alerts go:** nowhere yet. There is no Alertmanager. You see alert state on the Prometheus alerts page and in Grafana.
- **Compared with Stage 4:** readiness told the kubelet whether *one Pod* should get traffic. The SLO tells *people* whether *passengers* are being served.

### Step 5: Logs: one place, all services, after Pods are gone

```bash
bash stages/stage6/scripts/signals-lab.sh apply 4 helm
kubectl get ds alloy -n apollo-observability          # one Alloy Pod per node
kubectl port-forward -n apollo-observability svc/loki 13100:3100 >/dev/null 2>&1 &
curl -sG localhost:13100/loki/api/v1/query_range \
  --data-urlencode 'query={namespace="apollo-airlines-apps", service="booking"}' \
  --data-urlencode 'limit=5' | jq -r '.data.result[].values[][1]'
```

Alloy is the per-node collector. Its config in [`loki/alloy.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/helm/apollo11/templates/observability/loki/alloy.yaml):

```alloy
discovery.kubernetes "pods" {
  role = "pod"
  selectors { role = "pod"  field = "spec.nodeName=" + sys.env("NODE_NAME") }   # only Pods on my node
}
discovery.relabel "pod_logs" {
  rule { source_labels = ["__meta_kubernetes_namespace"]     target_label = "namespace" }
  rule { source_labels = ["__meta_kubernetes_pod_label_app"] target_label = "service" }   # the app label again
  rule { source_labels = ["__meta_kubernetes_pod_name"]      target_label = "pod" }
}
loki.write "local" { endpoint { url = "http://loki.apollo-observability.svc.cluster.local:3100/loki/api/v1/push" } }
```

- **What happens:** each Alloy Pod reads container logs for Pods on its own node, attaches `namespace`, `service`, `pod` and `container` labels, and pushes them to Loki. Loki keeps them on a PVC (`retention: 168h` in values).
- **Why a DaemonSet:** logs live on the node that ran the container. One collector per node covers every Pod, including ones scheduled later.
- **Why Loki indexes only labels:** labels pick the streams; `|= "text"` then searches inside them. That keeps the index small. As with metrics, don't make IDs into labels.
- **What's in a line:** the apps write JSON with `timestamp`, `level`, `service`, `trace_id`, `span_id`, `message`. In Stage 6, `trace_id` is filled from the request's span, so log lines can be joined to traces (Step 7).
- **Compared with Stage 5:** `kubectl logs` read one Pod's current container. Here you query every service at once, and lines from deleted Pods are still there.
- **Watch out:** finding *old* lines proves nothing about *current* collection. To test the pipeline, look for a request you just made.

### Step 6: Traces: follow one booking through four services

```bash
bash stages/stage6/scripts/signals-lab.sh apply 5 helm
bash stages/stage6/scripts/trace-test.sh             # prints trace_id=... services=...
```

A **span** is one timed operation (an incoming request, or one outgoing call). A **trace** is all spans that share one `trace_id`. The code that keeps one booking in one trace, from [`booking/main.go`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/code/booking/main.go):

```go
r.Use(otelgin.Middleware("booking"))      // reads an incoming traceparent header, starts a server span

func callService(parent context.Context, url, method, body, requestID string, ...) (int, []byte) {
    ctx, span := otel.Tracer("booking-service").Start(parent, ...)   // child span for the outbound call
    req, _ := http.NewRequestWithContext(ctx, method, url, ...)
    req.Header.Set("X-Request-ID", requestID)
    addTraceparent(req)                   // writes the W3C traceparent header for the next service
    ...
}
```

The Pods send spans to the Collector (`OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector.apollo-observability.svc.cluster.local:4317`, set by the app templates). The Collector config, [`otel-collector/config.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/helm/apollo11/templates/observability/otel-collector/config.yaml):

```yaml
receivers:  {otlp: {protocols: {grpc: {endpoint: 0.0.0.0:4317}, http: {endpoint: 0.0.0.0:4318}}}}
processors: {memory_limiter: {...}, batch: {timeout: 2s}}
exporters:  {otlp/tempo: {endpoint: tempo.apollo-observability.svc.cluster.local:4317}}
service:
  pipelines:
    traces: {receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlp/tempo]}
```

```bash
kubectl port-forward -n apollo-observability svc/tempo 13200:3100 >/dev/null 2>&1 &
TRACE_ID=<paste the trace_id from trace-test.sh>
curl -s localhost:13200/api/traces/$TRACE_ID \
  | jq -r '[.batches[].resource.attributes[] | select(.key=="service.name").value.stringValue] | unique'
```

- **What happens:** [`trace-test.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage6/scripts/trace-test.sh) logs in as the seeded passenger, books with a generated `traceparent`, waits until Tempo holds one trace containing booking, identity, flight and notification, then cancels the booking and checks the seat comes back.
- **Why every service must forward `traceparent`:** each hop only knows the trace it was handed. If one service builds its outbound request from a fresh context, the next service starts a new trace and the chain breaks. The README lists this as a lesson from building the stage.
- **Why a Collector in between:** apps send to one nearby endpoint and don't need to know about Tempo. Batching, memory limits and the backend choice live in one config.
- **Tracing is out of band:** if the Collector can't reach Tempo, bookings keep working and traces are silently lost. That is good for passengers, and a reason to check traces as their own pipeline.
- **Compared with Steps 2 and 5:** a p95 says "some bookings were slow". A trace says "*this* booking spent its time in the flight seat update".

### Step 7: Correlate one booking across all three signals

Substage 6 installs nothing new. It joins what you already have.

```bash
bash stages/stage6/scripts/signals-lab.sh apply 6 helm
# 1. Metric: when, and how much?
Q 'sum by (status) (rate(http_requests_total{service="booking"}[5m]))'
# 2. Trace: where? (Step 6 command, same TRACE_ID)
curl -s localhost:13200/api/traces/$TRACE_ID | jq '.batches | length'
# 3. Log: what did the service say?
curl -sG localhost:13100/loki/api/v1/query_range \
  --data-urlencode "query={namespace=\"apollo-airlines-apps\"} |= \"$TRACE_ID\"" \
  | jq -r '.data.result[] | "\(.stream.service): \(.values[0][1])"'
```

| Signal | Answers | Can't answer |
|---|---|---|
| Metric | *That* booking errors rose, and since when | Which request |
| Trace | *Where* in the call chain one request failed or waited | What the code was thinking |
| Log | *Why*, in the service's own words (`Booking created`, `User check failed`) | Rates and trends |

- **What joins them:** the `trace_id`. It is in every span, and booking writes it into its log lines. Time is the join between metrics and the other two.
- **The usual order:** a metric or alert tells you something is wrong → a trace from that window shows which hop → logs for that `trace_id` give the detail.
- **Compared with Stage 5:** the log field `trace_id` used to hold the `X-Request-ID`. Now it holds the real OpenTelemetry trace ID. The request ID still travels between services as a header, but is no longer written into log lines, so search Loki by trace ID.
- **Watch out:** not every failure logs. In the Step 4 drill, booking returns `502 Flight service unavailable` without writing a log line. The trace's failed `booking → flight` span is the evidence.
- The [correlation chapter](./learn/observability/correlating-a-booking) walks through more cases, including a notification failure under a successful booking.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| ServiceMonitor exists, target missing | Selector or port name doesn't match the Service, or monitor lacks `app.kubernetes.io/part-of` | `kubectl get svc -n apollo-airlines-apps --show-labels`; `curl localhost:19090/api/v1/targets` |
| Target listed but `down` | Pods gone or `/metrics` failing | `curl -s localhost:19090/api/v1/targets \| jq '.data.activeTargets[] \| {job: .labels.job, lastError}'` |
| `apollo:booking_error_ratio:5m` returns `[]` | No eligible bookings in the window (by design) | Make a booking, wait 30–60 s |
| Grafana panel empty, Prometheus has data | Wrong time range or datasource, or Grafana not ready | `curl localhost:13000/api/health` |
| Old logs in Loki, no new ones | Alloy not running on that node | `kubectl get ds alloy -n apollo-observability` |
| Bookings work, no new traces | Collector can't export to Tempo | `kubectl logs -n apollo-observability ds/otel-collector --tail=20` |
| Trace missing one service | That hop didn't forward `traceparent` | Check the service's outbound call uses the request context |
| `signals-lab.sh` refuses a substage | You went backwards | `bash stages/stage6/scripts/teardown.sh --purge`, then start again |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| Every search goes search → flight → flight-db, even for identical queries | Repeated work; the database sees the full read rate | [Stage 7](./stage-7): Redis cache-aside |
| Replica counts are fixed per environment (dev 1, staging 2, prod 3) | Too many Pods at night, too few in a spike | [Stage 7](./stage-7): HPA |
| Stage 4's CPU/memory requests were educated guesses | Wasted capacity or throttling, and nothing suggests better values | [Stage 7](./stage-7): VPA recommendations |
| `kubectl top` returns nothing | No metrics-server on kind | [Stage 7](./stage-7) |
| Alerts fire but notify nobody | No Alertmanager or contact point is configured | No stage page plans this yet |
| Grafana allows anonymous access; its admin password is in `values.yaml` | Anyone who reaches Grafana can read operations data | [Stage 8](./stage-8) (planned): Command Module (security) |
| One Prometheus, one Loki, one Tempo, on local PVCs | Telemetry is lost if the node or volume is | [Stage 9](./stage-9) (planned): Lunar Orbit, on real cloud storage |
| A rollout is gated only by readiness; nothing checks the error ratio before it continues | A bad release spends the error budget before anyone reacts | [Stage 10](./stage-10) (planned): Argo Rollouts mission |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | **Stage 6** |
|---|---|---|---|---|---|---|---|---|
| Runs on | One Docker host | 3-node kind | Same | Same | Same | Same | Same | Same |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment | + StatefulSet | Same | Helm release | Same, + observability |
| Recovery | `restart:` | None | ReplicaSet | Same | Same | + probes restart / drain | + Argo CD self-heal | Same |
| Service discovery | Docker DNS | Pod IP | Service + DNS | + cross-namespace DNS | + headless Services | Same | Same | + ServiceMonitors |
| Entry point | `ports:` | `port-forward` | NodePort | DNS → NodePort → Traefik + TLS → MetalLB → Envoy Gateway API | Envoy Gateway | Same | Same | + `grafana.apollo.local` |
| Config / secrets | `environment:` | Inline | ConfigMap / Secret | Same | Same | Same | Rendered from values | + `observability:` values |
| Data | Named volume | — | `emptyDir` | `emptyDir` | PVCs | Same | Same | + PVCs for Prometheus, Grafana, Loki, Tempo |
| Health checks | Compose healthcheck | None | Liveness + readiness | Same | Same | Startup / liveness / readiness | Same | + SLO and alerts |
| Resources | None | None | None | None | None | Requests = limits, PDBs | Per-env values | Same |
| How it's deployed | `docker compose up` | `kubectl apply` | `apply.sh` | Same | Same | Same | Helm / Kustomize / Argo CD | Same, + `signals-lab.sh` |
| Observability | `docker logs` | `kubectl logs` | `kubectl logs` | Same | Same | Same | Same | **Metrics, dashboards, SLO, logs, traces** |
| Scaling | Fixed | — | Fixed (2) | Fixed | Fixed | Fixed | Fixed per env | Fixed per env |

## Clean up

```bash
pkill -f 'port-forward' || true
bash stages/stage6/scripts/verify.sh --mode helm      # optional: the full automated check
bash stages/stage6/scripts/teardown.sh --purge        # add --mode kustomize if you used it
kubectl get ns | grep apollo                          # nothing
```

`--purge` removes the app, UI and observability namespaces, their PVCs, the controllers and the Operator CRDs. The kind cluster stays for Stage 7.

## You should now be able to explain

- Why Stage 5's `/metrics` could not be scraped, and what the code added.
- Why a ServiceMonitor existing does not mean Prometheus is collecting.
- Why a booking ID must never be a metric label.
- What `apollo:booking_error_ratio:5m` measures, why 4xx are excluded, and why "no data" is not "100%".
- Why a two-minute drill cannot prove a 28-day SLO.
- Why finding old log lines doesn't prove log shipping works now.
- How `traceparent` keeps one booking in one trace, and what happens when one hop drops it.
- Which signal answers "since when", which "where", and which "why".

**Next:** [Stage 7: Orbital Maneuvering](./stage-7) uses these measurements to add a cache and autoscaling, and to prove whether they help.
