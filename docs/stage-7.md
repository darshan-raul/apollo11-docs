---
title: "Stage 7 — Orbital Maneuvering: Autoscaling & Scheduling"
description: "Run controlled experiments on cache-aside, HPA, VPA and scheduling: measure first, change one variable, prove the effect."
sidebar_label: "Stage 7: Orbital (Scaling)"
---

# Build Stage 7: Orbital Maneuvering

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Namespace: `apollo-airlines-apps`.
- Read the [Orbital Maneuvering chapters](./learn/scaling/measurement-baseline) first (start with the baseline chapter).
- Needs: Stage 6 torn down; k6 installed for Exercise 3.
:::

**Skill this lab builds:** change one thing, measure before and after, and say which mechanism (cache, replicas, resources, placement) actually helped.

## Who changes what

| Mechanism | Changes | Reads | Apollo object |
|---|---|---|---|
| Cache-aside | Work per request | Redis key `search:<from>:<to>:<date>` (TTL 300 s) | `search` + `redis-0` |
| HPA | Replica **count** | CPU utilisation = usage ÷ **request** | `search-hpa` (dev: 1–3, chart default: 2–10, target 70%) |
| VPA (`Off`) | Nothing: **recommends** resources | Usage history | `search-vpa` (staging/prod only) |
| Scheduler + taints/affinity | Which node | Requests, taints, labels | `scaling-lab.sh` |
| metrics-server | (feeds HPA) | kubelet metrics | `kubectl top` |

---

## Exercise 1: Prove the cache with three independent signals

**Goal:** show a cache hit by header, by counter and by the key's TTL in Redis, not by the header alone.
**Time:** ~12 min

1. **Predict:** the same search twice, then once more after deleting the Redis key. What does `X-Cache` show each time?
2. **Deploy and set up helpers:**

```bash
bash stages/stage7/scripts/apply.sh --env dev
NS=apollo-airlines-apps
GW=$(kubectl get gateway apollo-gateway -n $NS -o jsonpath='{.status.addresses[0].value}')
D=$(date -u +%F)
S() { curl -s -D - -o /tmp/search.json -H "Host: search.apollo.local" "http://$GW/api/search?origin=BOM&destination=SIN&date=$D" | grep -i '^x-cache'; }
CACHE() { for p in $(kubectl get pod -n $NS -l app=search -o name); do kubectl exec -n $NS $p -- wget -qO- http://127.0.0.1:8083/metrics; done | awk '/^cache_(hits|misses)_total/ {s[$1]+=$2} END{for(k in s) print k, s[k]}' | sort; }
CACHE
```

3. **Do:**

```bash
S; S
CACHE
kubectl exec -n $NS redis-0 -- redis-cli keys 'search:*'
kubectl exec -n $NS redis-0 -- redis-cli ttl "search:BOM:SIN:$D"
kubectl exec -n $NS redis-0 -- redis-cli del "search:BOM:SIN:$D"
S
CACHE
```

4. **Check:**
   - First call `X-Cache: MISS`, second `HIT` (if both say MISS, an earlier call already cached it: use `redis-cli del`, then retry).
   - Counters: `cache_misses_total` +1, `cache_hits_total` +1 across the two calls.
   - The key `search:BOM:SIN:<date>` exists with `ttl` ≤ 300 and counting down.
   - After `del`, the next call is a `MISS` again; counters follow.
5. **Why:**
   - The header says which code path ran, the counter says how often, the key says what is stored and for how long.
   - Cache-aside: `search` checks Redis → on miss calls `flight`, writes the result with a TTL.
6. **Your turn:** results for `BOM→SIN` and `SIN→BOM` are separate keys. Run both, list the keys, and say what the key design implies about hit rate when many users search many different dates.

<details>
<summary>Answer</summary>

Each (origin, destination, date) is its own entry, so a workload that spreads across many dates or routes has a lower hit rate than one that repeats a few popular searches. The benchmark in Exercise 3 uses six routes so the hit rate can reach >90%.
</details>

---

## Exercise 2: Break it: stale data and a dead cache

**Goal:** see the two cache failure modes: wrong answers (stale) and no cache (degraded).
**Time:** ~12 min · **Needs:** Exercise 1 helpers.

### 2A: stale cache

1. **Predict:** you book a seat on a cached flight. Within the TTL, does a search show the old seat count or the new one?
2. **Do:**

```bash
S >/dev/null; S
jq '.results[0] | {id, flightNumber, availableSeats}' /tmp/search.json
FID=$(jq -r '.results[0].id' /tmp/search.json); BEFORE=$(jq -r '.results[0].availableSeats' /tmp/search.json)
TOKEN=$(curl -s -H "Host: identity.apollo.local" -H 'Content-Type: application/json' -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' http://$GW/api/users/login | jq -r .token)
BID=$(curl -s -X POST -H "Host: booking.apollo.local" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"flightId\":\"$FID\"}" http://$GW/api/bookings | jq -r .id)
echo "seats before booking: $BEFORE"
curl -s -H "Host: flight.apollo.local" http://$GW/api/flights/$FID | jq '.availableSeats'
S; jq '.results[0].availableSeats' /tmp/search.json
```

3. **Symptom:** `flight` (the source of truth) reports `BEFORE-1`. `search` still returns `BEFORE` with `X-Cache: HIT`. The cache is **stale** until the TTL expires or the key is deleted.
4. **Fix and prove:**

```bash
kubectl exec -n $NS redis-0 -- redis-cli del "search:BOM:SIN:$D"
S; jq '.results[0].availableSeats' /tmp/search.json
curl -s -X DELETE -H "Host: booking.apollo.local" -H "Authorization: Bearer $TOKEN" http://$GW/api/bookings/$BID | jq .
```

   - After `del`: `MISS`, and the number is `BEFORE-1`. Cancel the booking to restore the seat.
5. **Why:** a cache trades freshness for speed. Search results tolerate 5 minutes of staleness; a booking must never read the cache for its seat check (it asks `flight` directly).

### 2B: Redis is down

1. **Predict:** you stop Redis. Does `search` fail? Does it become unready?
2. **Do:**

```bash
kubectl scale sts/redis -n $NS --replicas=0
sleep 15
S ; curl -s -o /dev/null -w 'search status=%{http_code}\n' -H "Host: search.apollo.local" "http://$GW/api/search?origin=BOM&destination=SIN&date=$D"
kubectl exec -n $NS deploy/search -- wget -qO- http://127.0.0.1:8083/readyz
kubectl get pods -n $NS -l app=search
```

3. **Symptom:** requests still return `200` with results, no cache header (or `MISS`); `readyz` returns `ready` with `"cache":"unreachable"`; search Pods stay `1/1`. Search is **degraded**, not down.
4. **Recover and prove:**

```bash
kubectl scale sts/redis -n $NS --replicas=1
kubectl wait --for=condition=Ready pod/redis-0 -n $NS --timeout=90s
sleep 5; S; S
```

   - `MISS` then `HIT` again.
5. **Why:** the code treats the cache as optional. Compare Launchpad Exercise 5: a Redis outage there took `notification` and `booking` readiness down. Here the dependency is optional, so readiness correctly ignores it.
6. **Your turn:** with Redis down, what happens to `flight`'s load and to `search` latency? Which is the capacity risk of a cache you cannot do without?

<details>
<summary>Answer</summary>

Every search becomes a `flight` query, so `flight` and the database see the full request rate. A cache that hides load can hide an under-sized backend until the day it disappears.
</details>

---

## Exercise 3: A controlled benchmark: cache off vs on

**Goal:** make one claim ("the cache helps") with evidence from a fair experiment.
**Time:** ~25 min · **Needs:** k6, Exercise 1 setup.

1. **Predict:** at a fixed request rate, what changes with caching on: p95 latency, hit rate, CPU on `search`, load on `flight`? Write a number for each.
2. **Fix every variable except one.** Same image, date, rate, route list and replica count; **pause the HPA** so replicas cannot change mid-run:

```bash
kubectl delete hpa search-hpa -n $NS              # re-created by apply.sh in step 6
kubectl scale deploy/search -n $NS --replicas=1
export SEARCH_DATE=$D
kubectl port-forward -n $NS svc/search 18083:8083 >/dev/null 2>&1 &
```

3. **Run A: cache off (baseline).**

```bash
kubectl set env deploy/search -n $NS CACHE_ENABLED=false && kubectl rollout status deploy/search -n $NS
pkill -f 'port-forward.*18083'; kubectl port-forward -n $NS svc/search 18083:8083 >/dev/null 2>&1 & sleep 3
BASE_URL=http://localhost:18083 EXPECT_CACHE=off RATE=30 DURATION=60s k6 run --summary-export /tmp/off.json stages/stage7/k6/search.js
kubectl top pods -n $NS -l app=search
```

4. **Run B: cache on (the only change).**

```bash
kubectl set env deploy/search -n $NS CACHE_ENABLED=true && kubectl rollout status deploy/search -n $NS
pkill -f 'port-forward.*18083'; kubectl port-forward -n $NS svc/search 18083:8083 >/dev/null 2>&1 & sleep 3
BASE_URL=http://localhost:18083 EXPECT_CACHE=on RATE=30 DURATION=60s k6 run --summary-export /tmp/on.json stages/stage7/k6/search.js
kubectl top pods -n $NS -l app=search
```

5. **Compare:**

```bash
jq '.metrics | {p95: .http_req_duration["p(95)"], failed: .http_req_failed.value, hit_rate: .cache_hit_rate.value, dropped: .dropped_iterations.count}' /tmp/off.json /tmp/on.json
```

   - Expect hit rate `0` (off) vs `>0.9` (on). Whether p95 improves on a laptop with a small dataset is **an observation, not a given**: record what you measured. A threshold failure in the baseline run is a result (it is only a non-zero exit code).
6. **Restore and prove:**

```bash
pkill -f 'port-forward.*18083'
kubectl set env deploy/search -n $NS CACHE_ENABLED=true
bash stages/stage7/scripts/apply.sh --env dev --skip-build
kubectl get hpa search-hpa -n $NS
```

   - The HPA is back with its original target (dev: 1–3).
7. **Why:**
   - Warm-up traffic is excluded from the measured run so you measure steady state, not the first fill.
   - If two things change (cache **and** replicas), you cannot attribute the result. That is the whole reason for pausing the HPA.
8. **Your turn:** write the one-sentence conclusion this data supports. Use the form: "With *X* held fixed, enabling the cache changed *Y* from *a* to *b*; it did/did not change *Z*." Then say what you would measure next if p95 did not improve.

<details>
<summary>Hint</summary>

If latency did not improve, check whether the bottleneck is elsewhere (CPU saturation of `search` itself, port-forward overhead, k6 on the same host). `kubectl top` and dropped iterations tell you whether the generator or the service was the limit.
</details>

---

## Exercise 4: HPA: read it, predict it, break its inputs

**Goal:** be able to predict the HPA's replica number, and recognise `<unknown>` as a missing input.
**Time:** ~15 min

1. **Predict:** current replicas 2, CPU utilisation 140% against a 70% target. Desired replicas? (Formula: `ceil(current × currentUtil ÷ targetUtil)`.)
2. **Inspect:**

```bash
kubectl get hpa search-hpa -n $NS
kubectl describe hpa search-hpa -n $NS | sed -n '/Metrics:/,/Events:/p'
kubectl get hpa search-hpa -n $NS -o jsonpath='{.spec.behavior.scaleUp.policies}{"\n"}{.spec.behavior.scaleDown.stabilizationWindowSeconds}{"\n"}'
kubectl top pods -n $NS -l app=search
kubectl get deploy search -n $NS -o jsonpath='{.spec.template.spec.containers[0].resources}{"\n"}'
```

3. **Check:**
   - `TARGETS` like `3%/70%`, `MINPODS 1`, `MAXPODS 3` in dev (chart defaults are 2 and 10); conditions `AbleToScale=True`, `ScalingActive=True`.
   - Answer to step 1: `ceil(2 × 140 / 70) = 4` (then capped at `maxReplicas`: 3 in dev). Utilisation = usage ÷ **request** (not limit), so requests are the denominator.
   - Scale-up policy: up to +100% or +4 Pods per 30 s, no stabilisation; scale-down waits 300 s and removes at most 50% per minute.
4. **Break: remove the resource requests**

```bash
kubectl patch deploy search -n $NS --type json -p '[{"op":"remove","path":"/spec/template/spec/containers/0/resources"}]'
kubectl rollout status deploy/search -n $NS
sleep 45
kubectl get hpa search-hpa -n $NS
kubectl describe hpa search-hpa -n $NS | grep -E 'ScalingActive|FailedGetResourceMetric|missing request'
```

5. **Symptom:** `TARGETS <unknown>/70%`; condition `ScalingActive=False`, reason `FailedGetResourceMetric`, message `missing request for cpu`. The HPA is blind: it will neither scale up nor down.
6. **Fix and prove:**

```bash
kubectl rollout undo deploy/search -n $NS
kubectl rollout status deploy/search -n $NS
sleep 45
kubectl get hpa search-hpa -n $NS
```

   - Numeric `TARGETS` again.
7. **Why:** "unknown" means *missing input*, not "leave it alone". Requests drive three things at once: the scheduler's fit decision, the QoS class, and the HPA denominator.
8. **Your turn:** the HPA target is 70% of a 100 m request = 70 m per Pod. Search handles ~N requests/s at 70 m. If traffic doubles, how many replicas, and what limits you if `maxReplicas` is 10 but nodes are full?

<details>
<summary>Answer</summary>

Roughly double the replicas (up to 10). If nodes cannot fit more Pods, the extra Pods stay `Pending` (`Insufficient cpu`), as in Stage 4 Exercise 5: the HPA changes a number, it does not create capacity.
</details>

---

## Exercise 5: Watch the controllers hand off under real load

**Goal:** see scheduling (taint + affinity) and autoscaling act together, then be restored.
**Time:** ~15 min · **Needs:** two worker nodes, working metrics-server.

1. **Predict:** the script taints one worker `workload=search:NoSchedule` and gives `search` a matching toleration and preferred affinity. Will new `search` Pods land only on that worker? Will they land on both workers once there are 3 replicas?
2. **Read before running:**

```bash
sed -n 1,25p stages/stage7/scripts/scaling-lab.sh
```

   - It labels/taints one worker, restarts `search`, lowers the HPA target to 10% and the scale-down window to 30 s, runs a `search-load` Deployment, waits for scale-out, then removes the load and checks scale-in.
3. **Run it, and watch in a second terminal:**

```bash
# terminal 2
watch -n3 "kubectl get hpa search-hpa -n apollo-airlines-apps; kubectl get pods -n apollo-airlines-apps -l app=search -o wide"
# terminal 1
bash stages/stage7/scripts/scaling-lab.sh run
```

4. **Check:**
   - `TARGETS` climbs above 10%, `REPLICAS` rises from 1 toward 3.
   - New Pods appear on **different workers**: the toleration allows the tainted node, the *preferred* affinity only scores it higher, and topology spread favours distribution.
   - After load stops and the 30 s window passes, replicas return to baseline. The script restores taints, labels and the HPA.
5. **Prove clean-up:**

```bash
kubectl get hpa search-hpa -n $NS
kubectl get deploy search-load -n $NS 2>&1 | head -1
kubectl describe nodes | grep -A1 -i taints | head
```

   - Original target; `search-load` NotFound; no `workload=search` taint. If interrupted: `bash stages/stage7/scripts/scaling-lab.sh cleanup`.
6. **Why:**

| Mechanism | Hard or soft? | Effect here |
|---|---|---|
| Taint `NoSchedule` | Hard for Pods without a toleration | Keeps other workloads off the pool; does not evict running Pods |
| Toleration | Permission only | Allows `search` onto the tainted node |
| Preferred node affinity | Soft | Raises the node's score |
| Topology spread | Soft here | Spreads replicas |

7. **Your turn:** change "preferred" to "required" affinity in your head for `search`. With only the tainted worker matching, what would happen to the second and third replica if the worker is full?

<details>
<summary>Answer</summary>

They would stay `Pending`: required affinity is a hard filter, so the scheduler cannot fall back to the other worker. Soft preferences keep the application running at the cost of imperfect placement.
</details>

---

## Exercise 6: VPA: advice without action (read-only)

**Goal:** show what VPA in `Off` mode is, and why it sits beside an HPA.
**Time:** ~8 min · **Needs:** nothing running (dev disables VPA on purpose).

1. **Predict:** VPA is enabled for `search` in staging. Does it restart Pods? What would go wrong if it both recommended and *applied* CPU while the HPA scaled on CPU?
2. **Do:**

```bash
C=stages/stage7/helm/apollo11
helm template apollo11 $C -f $C/values-staging.yaml --show-only templates/autoscaling/search-vpa.yaml | grep -E 'kind:|updateMode|name:'
helm template apollo11 $C -f $C/values-dev.yaml     --show-only templates/autoscaling/search-vpa.yaml 2>&1 | head -3
```

3. **Check:** staging renders a `VerticalPodAutoscaler` with `updateMode: "Off"`; dev renders nothing (VPA is disabled in dev, so `kubectl get vpa` finds nothing there).
4. **Why:** HPA scales on CPU **utilisation = usage ÷ request**. If a VPA changed the request, the ratio changes, the HPA recomputes, and the two controllers chase each other. `Off` produces `target`/`lowerBound`/`upperBound` for a human to apply.
5. **Where recommendations live (staging/prod):** `kubectl describe vpa search-vpa -n apollo-airlines-apps` → `Recommendation`, empty until the recommender has collected samples.
6. **Your turn:** the VPA recommends `cpu: 250m`, current request is `100m`. Name two things that change if you apply it (HPA behaviour at the same load, how many Pods fit per node) and one that does not.

<details>
<summary>Answer</summary>

At the same absolute usage, utilisation falls (usage ÷ 250 m), so the HPA scales out later. Fewer Pods fit per node. The QoS class is unchanged if requests still equal limits (you must change both).
</details>

---

## Clean-up and baseline

```bash
kubectl get hpa,deploy -n apollo-airlines-apps
kubectl exec -n apollo-airlines-apps redis-0 -- redis-cli flushall    # optional: empty the cache
bash stages/stage7/scripts/verify.sh
```

## You can now

- [ ] Show a cache hit by header, counter and Redis key, and show a stale read.
- [ ] Design a fair before/after experiment and state what it does and does not prove.
- [ ] Predict the HPA's replica number and explain `<unknown>`.
- [ ] Distinguish taint, toleration, preferred and required affinity.
- [ ] Say why VPA runs in `Off` mode next to an HPA.

## Checkpoint

1. No CPU requests: can the HPA scale on CPU?
2. Why is scale-down slower than scale-up?
3. What does a taint do that node affinity does not?
4. What happens when HPA and VPA both manage CPU?

You have completed the supported local path (Launchpad → Stage 7). Security hardening is still *planned* (Stage 8); do not describe this deployment as hardened.

Next: [Capstone](./capstone), then the [cloud boundary](./eks).
