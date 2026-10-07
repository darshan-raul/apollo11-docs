---
title: "Stage 6 — Mission Operations: Observability & Tracing"
description: "Add metrics, dashboards, an SLO, logs and traces one at a time; break each pipeline and prove what you can and cannot see."
sidebar_label: "Stage 6: Mission Ops (Observability)"
---

# Build Stage 6: Mission Operations

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Namespaces: `apollo-airlines-apps`, `apollo-airlines-ui`, `apollo-observability`.
- Read the [Mission Operations chapters](./learn/observability/signals-and-metrics) first.
- Needs: no other stage's workloads running (`teardown.sh` from the last stage). ~8 GB free RAM.
- Work from `stages/stage6` (`cd stages/stage6`) and `export KUBE_CONTEXT=kind-apollo11`; the scripts refuse other contexts.
:::

:::caution[Verification status]
The repository marks this ordered one-signal-at-a-time path as implemented, with its clean end-to-end lifecycle run still pending. The older all-in-one installer (`apply.sh --mode helm --env dev`) is the maintainer-verified path. If a step differs from what is written here, trust the output and record it.
:::

**Skill this lab builds:** pick the right signal for a question, and prove each signal is *actually collected* instead of assuming it is.

## Which signal answers which question

| Question | Signal | Tool |
|---|---|---|
| How many / how fast / what fraction failed, over a window? | Metric | Prometheus (PromQL) |
| What did service X say at time T? | Log | Loki (`{service="x"} \|= "<id>"`) |
| Where did the time go in **this** request? | Trace | Tempo (trace ID) |
| Are we burning our error budget? | Recording rule + alert | Prometheus rules |

## The ladder

| Substage | Adds | Proof of collection |
|---|---|---|
| Baseline | Apollo only | Login + flight search work |
| 1 | Prometheus Operator, Prometheus, ServiceMonitors | `/api/v1/targets` shows app targets `up` |
| 2 | Grafana + dashboards | `/api/health`; a panel reacts to traffic |
| 3 | PrometheusRule (booking SLO) | Rule exists; error-ratio series responds to a failure |
| 4 | Loki + Alloy | A unique request ID is found in Loki |
| 5 | Tempo + OTel Collector | A trace with all four services |
| 6 | Correlation | One booking found as metric → trace → log |

---

## Exercise 0: Baseline: what can you not answer?

**Goal:** start with no telemetry and write down what you would be unable to explain.
**Time:** ~10 min

1. **Predict:** Apollo is running with no Prometheus, Loki or Tempo. A passenger says "booking took 10 s". List what you could check today.
2. **Do:**

```bash
cd stages/stage6
export KUBE_CONTEXT=kind-apollo11
bash scripts/apply.sh --without-observability
kubectl get ns | grep apollo
TOKEN=$(kubectl run c0 --rm -i --restart=Never -n apollo-airlines-apps --image=curlimages/curl:8.10.1 -- \
  curl -s -H 'Content-Type: application/json' -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' http://identity:8080/api/users/login | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "${TOKEN:0:12}..."
```

3. **Check:** no `apollo-observability` namespace; a token is returned.
4. **Why:** you can see Pod state and `kubectl logs` per Pod, but not rates over time, not a request's path, not history after a Pod is replaced. That is the gap each substage closes.
5. **Your turn:** write down three concrete questions you cannot answer (for example "what was booking's error rate 10 minutes ago?"). You will re-ask them at Exercise 7.

---

## Exercise 1: Metrics: prove Prometheus is actually scraping

**Goal:** see that a `ServiceMonitor` object is a *request* to scrape, and that collection is a separate fact.
**Time:** ~15 min

1. **Predict:** what is the difference between `kubectl get servicemonitor` listing a monitor and Prometheus having a target `up`?
2. **Render before you apply:**

```bash
bash scripts/signals-lab.sh render 1 helm | grep -E '^kind:' | sort | uniq -c
```

   - You see `Prometheus`, several `ServiceMonitor`, RBAC for discovery. Rendering touched nothing.
3. **Apply and prove collection:**

```bash
bash scripts/signals-lab.sh apply 1 helm
kubectl port-forward -n apollo-observability svc/prometheus 19090:9090 >/dev/null 2>&1 &
sleep 3
T() { curl -s localhost:19090/api/v1/targets | jq -r '.data.activeTargets[] | "\(.scrapePool)  \(.health)"' | sort; }
T
```

   - Expect one `up` target per app service.
4. **Generate traffic and read it back:**

```bash
for i in $(seq 1 30); do kubectl exec -n apollo-airlines-apps deploy/search -- wget -qO- "http://127.0.0.1:8083/healthz" >/dev/null; done
sleep 20
curl -sG localhost:19090/api/v1/query --data-urlencode 'query=sum(rate(http_requests_total[2m])) by (service)' | jq -r '.data.result[]|"\(.metric.service) \(.value[1])"'
```

   - A non-zero rate for `search`. An idle service may be absent: no traffic ≠ broken.
5. **Break: remove the discovery object**

```bash
kubectl -n apollo-observability get servicemonitor
kubectl -n apollo-observability get servicemonitor search -o yaml > /tmp/search-monitor.yaml    # use the real name from the list
kubectl -n apollo-observability delete servicemonitor search
sleep 40; T
```

   - The `search` target **disappears** from the list. The Service and Pods are fine, only the instruction to scrape is gone.
6. **Recover and prove:**

```bash
kubectl apply -f /tmp/search-monitor.yaml
sleep 40; T
for i in $(seq 1 20); do kubectl exec -n apollo-airlines-apps deploy/search -- wget -qO- http://127.0.0.1:8083/healthz >/dev/null; done
sleep 20
curl -sG localhost:19090/api/v1/query --data-urlencode 'query=rate(http_requests_total{service="search"}[2m])' | jq -r '.data.result[].value[1]'
```

   - Target `up` again, and new samples with a non-zero rate. Do not claim recovery until the **rate** moves.
7. **Why:** `ServiceMonitor` selects Services and ports; the Operator turns it into scrape config; Prometheus scrapes. Object exists ≠ target up ≠ samples advancing.
8. **Your turn:** make a target `down` (rather than missing). Scale `notification` to 0, wait one scrape interval, and read its target health and last error. What is different from step 5, and which query shows the outage as a *number*?

<details>
<summary>Answer</summary>

The target stays listed but `health: down` with an error such as `connection refused`/no endpoints. `up{job=...} == 0` (or `up` for that service) shows it as a metric. Missing target = discovery problem; down target = scrape problem. Restore with `kubectl scale deploy/notification -n apollo-airlines-apps --replicas=<original>`.
</details>

---

## Exercise 2: Dashboards are not the data

**Goal:** show that Grafana only displays; Prometheus keeps answering without it.
**Time:** ~8 min

1. **Predict:** you scale Grafana to 0. Does Prometheus still answer?
2. **Do:**

```bash
bash scripts/signals-lab.sh apply 2 helm
kubectl port-forward -n apollo-observability svc/grafana 13000:3000 >/dev/null 2>&1 &
sleep 3; curl -s localhost:13000/api/health
kubectl scale deploy/grafana -n apollo-observability --replicas=0
sleep 10
curl -s -m 3 localhost:13000/api/health || echo "grafana: down"
curl -s localhost:19090/-/ready
```

3. **Check:** Grafana health `ok` first; after the scale-down it is unreachable; Prometheus still says `Prometheus Server is Ready.`
4. **Recover and prove:**

```bash
kubectl scale deploy/grafana -n apollo-observability --replicas=1
kubectl rollout status deploy/grafana -n apollo-observability --timeout=120s
pkill -f 'port-forward.*13000' ; kubectl port-forward -n apollo-observability svc/grafana 13000:3000 >/dev/null 2>&1 &
sleep 3; curl -s localhost:13000/api/health
```

   - Open `http://localhost:13000` (credentials: `grafana` section of `helm/apollo11/values.yaml`), open the request-rate panel, generate traffic, and see it move.
5. **Why:** the data lives in Prometheus. A dashboard outage never loses data, and a healthy dashboard can show an empty panel if no samples exist.
6. **Your turn:** Grafana's datasources for logs and traces are configured at substage 2 even though Loki and Tempo do not exist yet. Find them in the UI. Why does a configured-but-dead datasource tell you nothing about whether that signal works?

---

## Exercise 3: Turn failures into a number: the booking SLO

**Goal:** drive an exact outage and read error ratio, remaining budget and alert state.
**Time:** ~20 min

1. **Predict:** objective is 99.5% successful *eligible* booking attempts (2xx or 5xx; 4xx excluded). During a 150 s `flight` outage with ~1 request/s all failing with 502, will the error ratio be ~0, ~1, or in between? What if there is no traffic at all?
2. **Apply the rules:**

```bash
bash scripts/signals-lab.sh apply 3 helm
curl -s localhost:19090/api/v1/rules | jq -r '.data.groups[].rules[] | select(.name|test("booking";"i")) | "\(.type) \(.name)"' | sort -u
```

   - Expect recording rules `apollo:booking_error_ratio:5m`, `:1h`, `:28d`, `apollo:booking_error_budget_remaining:28d`, and alerts such as `ApolloBookingErrorBudgetBurn`.
3. **Baseline:** query the error ratio *before* any failure (rule names from step 2):

```bash
Q() { curl -sG localhost:19090/api/v1/query --data-urlencode "query=$1" | jq -c '.data.result'; }
Q 'apollo:booking_error_ratio:5m'
```

   - Expect **empty** (`[]`), not `0` and not `1`: with no traffic the ratio is undefined. "No data" is not "perfect availability".
4. **Inject the exact outage (bounded, self-restoring):**

```bash
bash scripts/slo-lab.sh
```

   - Read it first: it records `flight`'s replica count, scales it to 0, sends 502-producing bookings for 150 s, restores `flight`, makes one recovery booking and cancels it. It restores on exit even if you interrupt it.
5. **Read the result (while or after):**

```bash
Q 'apollo:booking_error_ratio:5m'
Q 'apollo:booking_error_budget_remaining:28d'
curl -s localhost:19090/api/v1/alerts | jq -r '.data.alerts[] | "\(.labels.alertname) \(.state)"'
```

   - 5-minute ratio near `1` (all eligible attempts failed); remaining budget **negative** (not clamped); alert `pending` then `firing`.
6. **Prove recovery:** after the script ends, wait a few minutes and re-run step 5: the 5-minute ratio falls while the 1-hour and 28-day ratios decay slowly. The alert eventually resolves.
7. **Why:**
   - 4xx are excluded: a wrong password is the caller's fault, not an outage.
   - A short drill cannot prove a 28-day SLO: a fresh cluster has only minutes of history.
   - A latency histogram cannot say whether a given request succeeded; that is why error ratio is a separate series.
8. **Your turn:** change which responses count as errors: would a booking returning `409 No seats available` (a 4xx) consume budget? Check the rule expression with `jq` on the rules API and justify whether that is the right call for a flight that is sold out.

<details>
<summary>Answer</summary>

It would not consume budget, since 4xx are excluded. For sold-out flights that is correct: the service worked. If seat-assignment failed due to a bug (a 5xx), it would count.
</details>

---

## Exercise 4: Logs: a historical log is not a working pipeline

**Goal:** find one request in Loki by a unique ID, then stop collection and show *new* requests vanish while old ones remain.
**Time:** ~15 min

1. **Predict:** you stop the log shipper. Can you still find yesterday's log lines? Today's new requests?
2. **Apply and ship one request:**

```bash
bash scripts/signals-lab.sh apply 4 helm
kubectl port-forward -n apollo-observability svc/loki 13100:3100 >/dev/null 2>&1 &
sleep 3
NS=apollo-airlines-apps
RID=lab-log-$RANDOM
kubectl run c4 --rm -i --restart=Never -n $NS --image=curlimages/curl:8.10.1 -- \
  curl -s -H "X-Request-ID: $RID" http://identity:8080/healthz >/dev/null
L() { curl -sG localhost:13100/loki/api/v1/query_range --data-urlencode "query={service=~\".+\"} |= \"$1\"" --data-urlencode 'limit=5' | jq '.data.result|length'; }
sleep 15; L $RID
```

   - Expect `1` or more streams. If `0`, send a request that logs (a login or flight search carries the ID into the log line) and retry. Use `kubectl logs -n $NS deploy/identity | grep $RID` as the cross-check.
3. **Break: stop shipping by scheduling Alloy onto no node**

```bash
kubectl -n apollo-observability patch ds alloy --type=merge -p '{"spec":{"template":{"spec":{"nodeSelector":{"apollo11.io/log-break":"true"}}}}}'
sleep 15; kubectl get ds alloy -n apollo-observability
RID2=lab-log-$RANDOM
kubectl run c4b --rm -i --restart=Never -n $NS --image=curlimages/curl:8.10.1 -- \
  curl -s -H "X-Request-ID: $RID2" http://identity:8080/healthz >/dev/null
sleep 20
echo "old: $(L $RID)  new: $(L $RID2)"
```

4. **Symptom:** `DESIRED 0`; the old ID is still found, the new one is **not**.
5. **Recover and prove:**

```bash
kubectl -n apollo-observability patch ds alloy --type=merge -p '{"spec":{"template":{"spec":{"nodeSelector":{"apollo11.io/log-break":null}}}}}'
kubectl rollout status ds/alloy -n apollo-observability --timeout=120s
RID3=lab-log-$RANDOM
kubectl run c4c --rm -i --restart=Never -n $NS --image=curlimages/curl:8.10.1 -- curl -s -H "X-Request-ID: $RID3" http://identity:8080/healthz >/dev/null
sleep 20; L $RID3
```

   - New ID found again. Never delete Loki's PVCs.
6. **Why:** searchable history proves nothing about *current* collection. Always test with a freshly generated ID.
7. **Your turn:** logs carry `service`; request IDs carry across services. Query Loki for one booking ID across all services and list which services logged it (use the `service` label in the result).

<details>
<summary>Answer</summary>

`curl -sG … --data-urlencode "query={service=~\".+\"} |= \"$RID\"" | jq -r '.data.result[].stream.service' | sort -u` prints each service that logged the ID.
</details>

---

## Exercise 5: Traces: break the exporter, not the API

**Goal:** show tracing as a separate pipeline that can fail while bookings keep working.
**Time:** ~20 min

1. **Predict:** you point the OTel Collector at a dead Tempo port. Do bookings fail? Does the trace appear?
2. **Apply and prove a good trace:**

```bash
bash scripts/signals-lab.sh apply 5 helm
bash scripts/trace-test.sh
```

   - The script starts a client Pod, logs in, books with a generated `traceparent`, checks seat counts, polls Tempo until **one trace contains booking, identity, flight and notification**, cancels the booking and restores the seat. Keep its `trace_id=… services=…` line.
3. **Read the trace directly:**

```bash
kubectl port-forward -n apollo-observability svc/tempo 13200:3100 >/dev/null 2>&1 &
sleep 3
TRACE_ID=<paste the trace_id>
curl -s localhost:13200/api/traces/$TRACE_ID | jq -r '[.batches[].resource.attributes[]|select(.key=="service.name").value.stringValue]|unique'
```

4. **Break: dead exporter endpoint**

```bash
kubectl -n apollo-observability get cm otel-collector-config -o yaml > /tmp/otel-original.yaml
sed 's/tempo.apollo-observability.svc.cluster.local:4317/tempo.apollo-observability.svc.cluster.local:1/' /tmp/otel-original.yaml > /tmp/otel-broken.yaml
kubectl apply -f /tmp/otel-broken.yaml
kubectl -n apollo-observability rollout restart ds/otel-collector
kubectl -n apollo-observability rollout status ds/otel-collector --timeout=120s
bash scripts/trace-test.sh ; echo "exit=$?"
kubectl -n apollo-observability logs ds/otel-collector --tail=15 | grep -iE "error|export|refused|dropp" | head -5
```

5. **Symptom:** the script's booking steps succeed but it **fails at the Tempo check** (no complete trace). The Collector logs show export errors. The API never noticed.
6. **Recover and prove:**

```bash
kubectl apply -f /tmp/otel-original.yaml
kubectl -n apollo-observability rollout restart ds/otel-collector
kubectl -n apollo-observability rollout status ds/otel-collector --timeout=120s
bash scripts/trace-test.sh
```

   - A new `trace_id=… services=…` line with all four services. Delete `/tmp/otel-*.yaml`.
7. **Why:** tracing is out-of-band: apps send spans to a local Collector, which forwards to Tempo. A broken exporter loses traces without affecting requests, which also means you will not be told. Metrics and logs stay up (check them now).
8. **Your turn:** the trace-test sends its own `traceparent`. Remove that header from one hop's code path in your head: which services' spans would drop out of the trace, and why does context propagation have to be done by every service?

<details>
<summary>Answer</summary>

A service that does not forward `traceparent` on its outbound call starts a new trace for the downstream service, so its spans become a separate trace. Every hop must copy the header.
</details>

---

## Exercise 6: Correlate one booking: metric → trace → log

**Goal:** go from a symptom on a graph to the exact request and its log lines.
**Time:** ~15 min

1. **Predict:** a booking fails with 502. In which order do you consult metric, trace and log, and what does each narrow down?
2. **Create a failure on purpose (short):**

```bash
NS=apollo-airlines-apps
ORIG=$(kubectl get deploy flight -n $NS -o jsonpath='{.spec.replicas}'); kubectl scale deploy/flight -n $NS --replicas=0
kubectl rollout status deploy/flight -n $NS --timeout=60s
TRACE=$(openssl rand -hex 16); RID=corr-$TRACE
kubectl run c6 --rm -i --restart=Never -n $NS --image=curlimages/curl:8.10.1 --command -- sh -c "
  T=\$(curl -s -H 'Content-Type: application/json' -d '{\"email\":\"passenger@apolloairlines.com\",\"password\":\"pass123\"}' http://identity:8080/api/users/login | sed -n 's/.*\"token\":\"\\([^\"]*\\)\".*/\\1/p')
  curl -s -o /dev/null -w 'booking -> %{http_code}\n' -X POST -H \"Authorization: Bearer \$T\" -H 'Content-Type: application/json' \
    -H 'X-Request-ID: $RID' -H 'traceparent: 00-$TRACE-0123456789abcdef-01' \
    -d '{\"flightId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\"}' http://booking:8082/api/bookings"
kubectl scale deploy/flight -n $NS --replicas=$ORIG; kubectl rollout status deploy/flight -n $NS --timeout=120s
```

   - Prints `booking -> 502`.
3. **Follow it:**
   1. **Metric:** error ratio / 5xx rate for booking rose (Exercise 3 queries). Tells you *that* and *since when*. Not which request.
   2. **Trace:** `curl -s localhost:13200/api/traces/$TRACE | jq` shows the `booking → flight` span failing. Tells you *where*.
   3. **Log:** query Loki for `$RID` (Exercise 4's `L`) and read booking's message (`Flight service unavailable`). Tells you *why*, in the app's words.
4. **Why:** each signal answers a different question. An aggregate percentile cannot give you the trace of one slow booking; the shared IDs (`X-Request-ID`, `trace_id`) are what join them.
5. **Your turn:** repeat with `notification` scaled to 0 instead. Predict the booking status code, then use the three signals to prove the passenger's booking succeeded while one downstream call failed. Which signal first reveals it?

<details>
<summary>Answer</summary>

The booking returns `201` (notification is called asynchronously after the row is saved). The *trace* shows a failed notification span under a successful booking; the metric for booking may not move at all; logs contain the failed notify call. This is why "the booking succeeded" and "everything worked" are different claims.
</details>

---

## Exercise 7: Re-ask the Exercise 0 questions

**Goal:** close the loop on your original gap list.
**Time:** ~5 min

For each question you wrote in Exercise 0, name the signal and the exact query or command that now answers it. Anything you still cannot answer is a gap worth noting.

## Clean-up

```bash
pkill -f 'port-forward' || true
rm -f /tmp/otel-*.yaml /tmp/search-monitor.yaml
bash scripts/teardown.sh --purge     # add --mode kustomize if you used it
cd ../..
```

- Confirm `kubectl get ns | grep apollo` shows nothing before starting Stage 7.

## You can now

- [ ] Pick metric, log or trace for a given question.
- [ ] Show a ServiceMonitor is not collection, and a historical log is not a working pipeline.
- [ ] Read an SLO error ratio and budget, including why "no data" is not "100%".
- [ ] Break and restore a telemetry pipeline without affecting the API.
- [ ] Go from a metric spike to the trace and logs of one request.

## Checkpoint

1. Why avoid putting a booking ID in a Prometheus label?
2. Which header joins spans across services?
3. Collector exporter dead: which signals survive?
4. Why can a 99.5% SLO not be proven by a two-minute drill?

Next: [Stage 7: Orbital Maneuvering](./stage-7).
