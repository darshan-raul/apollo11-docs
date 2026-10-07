---
title: "Measurement before optimization"
description: "What a valid baseline contains, why one fast curl is not a result, and how the k6 experiment is run."
---

# Measurement before optimization

*Stage 7 · Orbital Maneuvering*

**You will be able to:** define a baseline, change one variable, and report what the data does and does not support.

## Five parts of a baseline

| # | Part | Apollo's k6 run |
|---|---|---|
| 1 | **Workload** | `constant-arrival-rate`: 50 req/s for 2 min over six seeded routes, fixed order |
| 2 | **Environment** | Same kind cluster, node capacity, image, replica count, UTC search date |
| 3 | **Success criteria** | `checks` all pass, `http_req_failed < 1%`, `p95 < 200 ms`, no dropped iterations |
| 4 | **Saturation signals** | `kubectl top`, dropped iterations (is the generator the limit?) |
| 5 | **Time window** | Steady state; warm-up traffic excluded in `setup()` |

- Thresholds are lab acceptance criteria, not a production SLO.

## Why one `curl` is not evidence

| Hides | Example |
|---|---|
| Tail latency | 100 concurrent requests fighting for DB connections |
| Cold start | First request fills the cache |
| Error cascades | Fast "success" because a dependency failed instantly |

## The experiment (`stages/stage7/k6/README.md`)

1. Port-forward `svc/search` to `18083` (bypasses edge TLS for **both** runs).
2. Save then **pause the HPA**; fix replicas at 1; save `CACHE_ENABLED`.
3. `CACHE_ENABLED=false` → `EXPECT_CACHE=off k6 run …` (must see only MISS).
4. `CACHE_ENABLED=true` → `EXPECT_CACHE=on k6 run …` (hit rate must exceed 90%).
5. Compare with `jq`; restore HPA, replicas and cache setting.

```bash
BASE_URL=http://localhost:18083 EXPECT_CACHE=off k6 run --summary-export off.json stages/stage7/k6/search.js
jq '.metrics | {http_req_duration, http_req_failed, checks, cache_hit_rate, dropped_iterations}' off.json
```

## Interpreting

- Higher hit ratio = the cache served requests. It does **not** prove lower latency. Compare p95, failures, throughput and CPU.
- A small local dataset may show no worthwhile gain. Report that; don't loosen thresholds or substitute one fast request.
- No seeded flights ⇒ set `SEARCH_DATE` or reseed. Failed checks ⇒ read response bodies first. Dropped iterations ⇒ the generator, not the service, was the limit.
- Do not mix direct-Service and Gateway timings.

## Check yourself

<details>
<summary>Why pause the HPA during the comparison?</summary>

Otherwise replicas change mid-run and you cannot attribute the difference to the cache.
</details>

<details>
<summary>Why warm the cache outside the measured window?</summary>

So the measurement reflects steady-state serving, not the first fill.
</details>
