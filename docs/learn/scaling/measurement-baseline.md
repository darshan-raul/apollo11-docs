---
title: "Measurement before optimization"
description: "What makes a performance comparison valid, open and closed load models, what dropped iterations and Little's law say about a run, how Apollo's k6 cache benchmark controls its variables, and how to report a result honestly."
---

# Measurement before optimization

*Stage 7 · Orbital Maneuvering*

**You will be able to:** design a before-and-after comparison that changes one variable, choose an open load model and explain why, read a k6 summary including dropped iterations, size a load generator with Little's law, and report what a result does and does not support.

Search feels slow, so someone adds a cache, and afterwards it "feels faster". Was it the cache? A warmer database? A quieter laptop? Fewer browser tabs open? Without a controlled comparison, an improvement, or the absence of one, is an anecdote. Performance work is full of changes that help in theory and do nothing in practice, and a few that make things worse. Stage 6 made the system observable; this chapter turns observation into **evidence**.

## A comparison is an experiment

Record how the system behaves now (the **baseline**), change **one** thing, repeat the **identical** test, compare. Change two things at once and you cannot say which mattered. Change the test and you cannot compare at all.

| Part | Question | Apollo's cache benchmark |
|---|---|---|
| **Workload** | What load, in what shape? | 50 requests/s for 2 minutes, six seeded routes in a fixed order (`k6/search.js`) |
| **Environment** | What else is held constant? | Same kind cluster, image, search date, **one** search replica, HPA removed |
| **Variable** | What exactly changes? | `CACHE_ENABLED=false` vs `true`, nothing else |
| **Success criteria** | What counts as good, decided beforehand? | All checks pass, failures < 1%, p95 < 200 ms, zero dropped iterations, hit rate 0 (off) or > 90% (on) |
| **Saturation signals** | What else could be the limit? | Pod CPU and throttling, Redis, flight, the load generator |
| **Window** | Which part of the run counts? | Warm-up requests run in `setup()`, outside the measured window |

The thresholds are this course's acceptance criteria for a laptop cluster, not a production SLO.

### Why one `curl` is not evidence

| A single request hides | Example |
|---|---|
| The tail | One request is fast; the 95th of a hundred concurrent ones waits for a database connection |
| Warm-up effects | The first request fills the cache, the next 99 are hits |
| Fast failures | A dependency failing instantly looks like excellent latency |
| Noise | One sample cannot be told apart from the background variation of a busy laptop |

## Open and closed load

How the load generator sends requests changes what you measure.

| Model | How it works | k6 executor | What a slow service does to the load |
|---|---|---|---|
| **Closed** | N virtual users, each sends a request, waits for the answer, sends the next | `constant-vus`, `ramping-vus` | Slower responses mean **fewer** requests. The test quietly backs off exactly when the system struggles |
| **Open** | New requests start at a fixed **arrival rate**, whatever happened to earlier ones | `constant-arrival-rate`, `ramping-arrival-rate` | Arrivals continue; slowness shows as latency, queueing and dropped iterations |

Real passengers behave like an open model: they do not wait for each other. A closed test hides overload by slowing itself down, a flaw known as **coordinated omission**. Apollo's two scripts are both open: `search.js` at a constant 50/s, `capacity.js` ramping 10 → 50 → 100 → 200 → 10 per second over 14 minutes.

### Dropped iterations and Little's law

An arrival-rate executor still needs a **virtual user (VU)** free to start each request. **Little's law** says how many are busy at once:

```text
concurrent requests = arrival rate × average response time
```

At 50/s and 40 ms, only 2 VUs are busy. At 50/s and 2 s, 100 are. `search.js` allows at most 100 VUs; `capacity.js` 200. When every VU is busy waiting for responses, k6 cannot start the next scheduled request and counts a **dropped iteration**.

So dropped iterations usually mean **the system got slow**, not that the load generator was weak: at 200/s, `capacity.js` runs out of VUs once the average response passes 1 s. Only if the k6 process itself is starved for CPU (check its host) is the generator the limit. Either way the run did not deliver its planned load, so its latency numbers describe less traffic than intended.

## The cache benchmark, step by step

From [`k6/README.md`](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage7/k6/README.md):

1. **Fix the path.** Port-forward `svc/search` to `localhost:18083`. Both runs use it, so neither includes the Gateway or TLS. A port-forward to a Service connects to **one** Pod, which is another reason to run exactly one replica.
2. **Fix the replicas.** Save the HPA, delete it, scale search to 1. An HPA changing replicas mid-run would be a second variable.
3. **Baseline.** `kubectl set env deploy/search CACHE_ENABLED=false`, wait for the rollout, restart the port-forward, run with `EXPECT_CACHE=off`: every response must be a `MISS`.
4. **Change one thing.** Set `CACHE_ENABLED=true`, run the same script with `EXPECT_CACHE=on`: the hit rate must exceed 90%.
5. **Compare**, then restore the HPA, replicas and cache setting from what you saved.

```bash
BASE_URL=http://localhost:18083 EXPECT_CACHE=off k6 run --summary-export off.json stages/stage7/k6/search.js
BASE_URL=http://localhost:18083 EXPECT_CACHE=on  k6 run --summary-export on.json  stages/stage7/k6/search.js
for f in off.json on.json; do
  jq -c --arg f "$f" '.metrics | {run: $f, p95: .http_req_duration["p(95)"], failed: .http_req_failed.value,
    hit_rate: .cache_hit_rate.value, dropped: (.dropped_iterations.count // 0)}' "$f"
done
```

The cache lives in Redis, not in search, so step 4's rollout does not empty it, and `setup()` re-warms the same six keys anyway.

## Reading and reporting the result

- **Compare the same numbers, from the same path.** Never put a port-forward timing next to a Gateway timing.
- **A hit rate is a mechanism, not a result.** It proves the cache served requests, not that latency, errors or CPU improved. Report p95, failures, throughput and CPU together.
- **Repeat.** One pair of runs on a laptop is noisy. Run each side more than once and report the spread, not the best run.
- **Watch the host.** Apollo's own notes record a 6-core host at load average above 30 during validation, enough to push identity past its startup window. A busy machine measures itself.
- **Report the boundary, not a wish.** The recorded Stage 7 capacity run scaled search 1 → 2 → 3 with zero failed requests, and still **failed** its threshold on dropped iterations. That is a measured capacity boundary. The honest report says so. It does not loosen the threshold, shorten the run, or replace it with one fast request.
- **A small local dataset may show no gain.** If six routes in a tiny database are already fast, the cache may not matter here. That is a valid result.

## Try it

:::caution[Unverified]
Not yet run on a live cluster for this documentation revision. Needs [k6](https://k6.io) and any cluster; uses a throwaway namespace.
:::

See open load produce dropped iterations once each iteration is slow (the script holds each VU to simulate a slow response):

```bash
kubectl create namespace load-demo
kubectl -n load-demo create deployment web --image=nginx:1.27-alpine
kubectl -n load-demo rollout status deploy/web
kubectl -n load-demo port-forward deploy/web 15678:80 >/dev/null &

cat > /tmp/open.js <<'EOF'
import http from 'k6/http';
import { sleep } from 'k6';
export const options = { scenarios: { open: {
  executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '20s',
  preAllocatedVUs: 5, maxVUs: 10 } } };
export default function () {
  http.get('http://localhost:15678/');
  sleep(Number(__ENV.EXTRA || 0));       // simulate a slow response by holding the VU
}
EOF
k6 run -e EXTRA=0   /tmp/open.js | grep -E 'iterations|dropped'    # ~400 iterations, none dropped
k6 run -e EXTRA=1   /tmp/open.js | grep -E 'iterations|dropped'    # 10 VUs × 1 s each < 20/s: drops

kill %1; kubectl delete namespace load-demo
```

- With fast iterations, 20/s needs well under one VU at a time.
- When each iteration holds its VU for a second, Little's law needs 20 VUs; with 10, about half the planned iterations are dropped.

## Common misconceptions

- **"It felt faster, so it is faster."** Feelings are not controlled.
- **"Hit rate is the goal."** Latency, errors and cost are the goal; hit rate is a mechanism.
- **"A fixed number of virtual users is a fixed load."** In a closed model, a slow system receives less load.
- **"Dropped iterations mean k6 was too weak."** Usually they mean responses got slow and every VU was waiting.
- **"I can change replicas and the cache in the same run."** Then the effect cannot be attributed.

## Check yourself

<details>
<summary>Why delete the HPA and fix search at one replica for the cache comparison?</summary>

The HPA could change the replica count during either run, adding a second variable. A port-forward also reaches only one Pod.
</details>

<details>
<summary><code>capacity.js</code> at 200 requests/s reports dropped iterations with <code>maxVUs: 200</code>. What average response time does that imply?</summary>

At least about 1 s: 200/s × 1 s = 200 concurrent requests, all VUs busy.
</details>

<details>
<summary>Why warm the cache in <code>setup()</code> rather than in the measured window?</summary>

So the run measures steady-state serving, not the first fill of each key.
</details>

## Where this leads

With a baseline method in hand, the first lever to test is one that removes work instead of adding capacity: [Cache-aside](./cache-aside).

## References

- [k6: open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
- [k6: dropped iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/)
- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
