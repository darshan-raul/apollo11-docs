---
title: "Measurement before optimization"
description: "What a valid baseline contains, why one fast curl is not a result, and how the k6 experiment is run."
---

# Measurement before optimization

*Stage 7 · Orbital Maneuvering*

**You will be able to:** define a baseline, change exactly one variable, and report what the data does and does not support.

## The problem

Search feels slow, so someone adds a cache, and it "feels faster". Was it the cache? A warmer database? Fewer other users on your laptop? Without a controlled comparison, any improvement (or non-improvement) is an anecdote. Performance work is full of changes that help in theory and do nothing in practice, so you need evidence *before* you change anything.

## The idea in plain words

This is the scientific method applied to a system: record how it behaves now (the **baseline**), change **one** thing, repeat the identical test, and compare. If two things change at once you cannot say which mattered; if the test differs you cannot compare at all.

A valid baseline has five parts:

| # | Part | Apollo's k6 run |
|---|---|---|
| 1 | **Workload:** what load, how shaped | `constant-arrival-rate`: 50 req/s for 2 min over six seeded routes in fixed order |
| 2 | **Environment:** where it runs | Same kind cluster, node capacity, image, replica count and UTC search date |
| 3 | **Success criteria:** what counts as good | All `checks` pass, `http_req_failed < 1%`, `p95 < 200 ms`, no dropped iterations |
| 4 | **Saturation signals:** what else could be the limit | `kubectl top`, dropped iterations (is the *generator* the bottleneck?) |
| 5 | **Time window:** steady state | Warm-up traffic excluded in `setup()` |

These thresholds are this course's acceptance criteria, not a production SLO.

## Why one `curl` is not evidence

| It hides | Example |
|---|---|
| Tail latency | 100 concurrent requests competing for database connections |
| Cold-start effects | The first request fills the cache |
| Error cascades | A "fast success" that is really a dependency failing instantly |

## How it works: the experiment

*Source: `stages/stage7/k6/README.md`*

1. Port-forward `svc/search` to `18083`. This bypasses edge TLS for **both** runs so the comparison is fair.
2. Save, then **pause the HPA**, and fix replicas at 1. Otherwise the replica count changes mid-run and confuses the result.
3. Set `CACHE_ENABLED=false` and run k6 with `EXPECT_CACHE=off` (it must see only misses).
4. Set `CACHE_ENABLED=true` and run again with `EXPECT_CACHE=on` (hit rate must exceed 90%).
5. Compare with `jq`, then restore the HPA, replicas and cache setting.

```bash
BASE_URL=http://localhost:18083 EXPECT_CACHE=off k6 run --summary-export off.json stages/stage7/k6/search.js
jq '.metrics | {http_req_duration, http_req_failed, checks, cache_hit_rate, dropped_iterations}' off.json
```

Warming the cache happens *outside* the measured window so you measure steady-state serving, not the first fill.

## Interpreting the result

- A higher **hit ratio** proves the cache served requests. It does **not** prove lower latency. Compare p95, failures, throughput and CPU together.
- A small local dataset may show no worthwhile gain. Report that honestly; do not loosen thresholds or swap in one fast request.
- No seeded flights ⇒ set `SEARCH_DATE` or reseed. Failed checks ⇒ read response bodies first. Dropped iterations ⇒ the load generator, not the service, was the limit.
- Never mix direct-Service and Gateway timings.

## Common misconceptions

- **"It felt faster, so it is faster."** Feelings are not controlled.
- **"Hit rate is the goal."** Latency, errors and cost are the goal; hit rate is a mechanism.
- **"I can change replicas and cache together."** Then you cannot attribute the effect.

## Check yourself

<details>
<summary>Why pause the HPA during the comparison?</summary>

Otherwise replicas change mid-run and you cannot attribute the difference to the cache.
</details>

<details>
<summary>Why warm the cache outside the measured window?</summary>

So the measurement reflects steady-state serving, not the first fill.
</details>

## Where this leads

With a baseline in hand, we can test the first lever: a cache that avoids repeating work.
