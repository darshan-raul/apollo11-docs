---
title: "Stage 4 — Flight Control: Reliability, Lifecycle & Governance"
description: "Learn what each probe makes the kubelet do, how shutdown races routing, what requests and PDBs promise, by causing each failure."
sidebar_label: "Stage 4: Flight Control (Reliability)"
---

# Build Stage 4: Flight Control

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Namespace: `apollo-airlines-apps`.
- Needs: two healthy `booking` replicas. Read the [Flight Control chapters](./learn/reliability/probes) first.
- Scratch Pods in Exercises 2, 4, 5 are named `lab-*` and are deleted at the end of each exercise.
:::

**Skill this lab builds:** given "the Pod restarted / left the load balancer / won't schedule / got evicted", name the mechanism that acted and the field that controls it.

## The contract Stage 4 adds to every workload

| Mechanism | Set in the manifest | Who acts | Effect |
|---|---|---|---|
| `startupProbe` `/healthz/startup` | 6 × 5 s = 30 s budget | kubelet | Holds off liveness and readiness; exhausting it restarts the container |
| `livenessProbe` `/healthz/live` | every 10 s, 3 failures | kubelet | **Restarts** the container |
| `readinessProbe` `/healthz/ready` | every 5 s, 3 failures | kubelet → EndpointSlice | **Removes** Pod from Service endpoints; no restart |
| `preStop: sleep 5` + `terminationGracePeriodSeconds: 30` | booking Deployment | kubelet | Delay before SIGTERM; hard kill at 30 s |
| `requests == limits` | all 10 workloads | scheduler (requests), kernel (limits) | `Guaranteed` QoS |
| `priorityClassName` | `booking`, `search` critical; `notification` low | scheduler | Preemption order |
| `topologySpreadConstraints` | `maxSkew: 1`, `ScheduleAnyway` | scheduler | **Soft** preference to spread over nodes |
| `PodDisruptionBudget` | `booking-pdb`, `frontend-pdb` (`minAvailable: 1`) | Eviction API | Limits **voluntary** evictions only |

---

## Exercise 1: Read the contract from the live cluster

**Goal:** confirm every row above on real objects, not on trust.
**Time:** ~8 min

1. **Predict:** for `booking`, what are its QoS class, priority number and node placement?
2. **Do:**

```bash
bash stages/stage4/scripts/apply.sh
NS=apollo-airlines-apps
kubectl get deploy booking -n $NS -o jsonpath='startup  : {.spec.template.spec.containers[0].startupProbe.httpGet.path}{"\n"}liveness : {.spec.template.spec.containers[0].livenessProbe.httpGet.path}{"\n"}readiness: {.spec.template.spec.containers[0].readinessProbe.httpGet.path}{"\n"}'
kubectl get pods -n $NS -l app=booking -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass,PRIORITY:.spec.priority,CLASS:.spec.priorityClassName,NODE:.spec.nodeName
kubectl get pods -n $NS -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl get pdb -A
```

3. **Check:**
   - Paths `/healthz/startup`, `/healthz/live`, `/healthz/ready`.
   - Booking Pods: `Guaranteed`, priority `1000000`, class `apollo-airlines-app-critical`. `notification` is `-100000`.
   - All app/data Pods report `Guaranteed`. PDBs: `booking-pdb` (`MIN AVAILABLE 1`) and `frontend-pdb`.
   - Booking Pods usually sit on different workers: a **preference** (`ScheduleAnyway`).
4. **Why:** the manifest says what you *asked*. Only the live object tells what the scheduler *did*.
5. **Your turn:** scale booking to 3 with `kubectl scale`, then read the `NODE` column. Does `maxSkew: 1` guarantee anything? Scale back to 2.

<details>
<summary>Answer</summary>

With two workers, the third Pod makes the split 2/1, which satisfies `maxSkew: 1`. If a worker were full, `ScheduleAnyway` would still place it unevenly rather than leave it Pending. `DoNotSchedule` would make it a hard rule.
</details>

---

## Exercise 2: One probe lab, three different kubelet actions

**Goal:** trigger each probe's failure and observe three different outcomes.
**Time:** ~15 min

Create a scratch Pod you control completely (it does not touch Apollo):

```bash
NS=apollo-airlines-apps
kubectl apply -n $NS -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata: {name: lab-probes, labels: {app: lab-probes}}
spec:
  containers:
    - name: c
      image: busybox:1.36.1
      command: ["sh","-c","sleep 25; touch /tmp/started /tmp/ready /tmp/alive; sleep 100000"]
      startupProbe:   {exec: {command: ["cat","/tmp/started"]}, periodSeconds: 5, failureThreshold: 10}
      readinessProbe: {exec: {command: ["cat","/tmp/ready"]},   periodSeconds: 3, failureThreshold: 2}
      livenessProbe:  {exec: {command: ["cat","/tmp/alive"]},   periodSeconds: 3, failureThreshold: 2}
---
apiVersion: v1
kind: Service
metadata: {name: lab-probes}
spec: {selector: {app: lab-probes}, ports: [{port: 80, targetPort: 80}]}
YAML
```

### 2A: startup holds everything back

1. **Predict:** the file `/tmp/started` appears after 25 s. For those 25 s, will the Pod be `Ready`? Will liveness restart it (liveness would fail: `/tmp/alive` does not exist yet)?
2. **Watch:**

```bash
kubectl get pod lab-probes -n $NS -w     # Ctrl-C after it shows 1/1
kubectl describe pod lab-probes -n $NS | sed -n '/^Events:/,$p'
```

3. **Check:** `0/1` for ~25–30 s with `Startup probe failed` warnings, **no restarts**, then `1/1`. Liveness and readiness never ran during startup.

### 2B: readiness failure = removed from endpoints, not restarted

1. **Predict:** you delete `/tmp/ready`. What changes in `READY`, `RESTARTS`, and the Service's endpoints?
2. **Do:**

```bash
EP() { kubectl get endpointslice -n $NS -l kubernetes.io/service-name=lab-probes -o jsonpath='{range .items[*].endpoints[*]}ready={.conditions.ready}{"\n"}{end}'; }
EP
kubectl exec -n $NS lab-probes -- rm /tmp/ready
sleep 8
kubectl get pod lab-probes -n $NS
EP
```

3. **Check:** `0/1`, `RESTARTS 0`, endpoint `ready=false`.
4. **Recover and prove:**

```bash
kubectl exec -n $NS lab-probes -- touch /tmp/ready
sleep 6; kubectl get pod lab-probes -n $NS; EP
```

   - `1/1`, still `RESTARTS 0`, `ready=true`.

### 2C: liveness failure = restart

1. **Predict:** delete `/tmp/alive`. What happens to the container, and to `/tmp/ready`?
2. **Do:**

```bash
kubectl exec -n $NS lab-probes -- rm /tmp/alive
sleep 12
kubectl get pod lab-probes -n $NS
kubectl describe pod lab-probes -n $NS | grep -E 'Liveness probe failed|Killing|Restart Count'
```

3. **Check:** `RESTARTS 1`, event `Container c failed liveness probe, will be restarted`. The container filesystem was reset, so all three files are gone and startup runs again (~25 s).

### What 2A–2C showed

| Probe | Failed because | Kubelet did | Evidence |
|---|---|---|---|
| startup | not started yet | waited | `Startup probe failed` events, `RESTARTS 0` |
| readiness | `/tmp/ready` missing | removed endpoint | `READY 0/1`, `ready=false`, `RESTARTS 0` |
| liveness | `/tmp/alive` missing | killed & restarted | `RESTARTS 1`, `Killing` event |

### 2D: the case for a startup probe

1. **Predict:** an app needs 20 s to start, but its liveness probe starts after 5 s with `failureThreshold: 2`, `periodSeconds: 5`. What happens?
2. **Do:**

```bash
kubectl apply -n $NS -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata: {name: lab-slow}
spec:
  containers:
    - name: c
      image: busybox:1.36.1
      command: ["sh","-c","sleep 20; touch /tmp/alive; sleep 100000"]
      livenessProbe: {exec: {command: ["cat","/tmp/alive"]}, initialDelaySeconds: 5, periodSeconds: 5, failureThreshold: 2}
YAML
sleep 45; kubectl get pod lab-slow -n $NS
```

3. **Symptom:** restarts climb; eventually `CrashLoopBackOff`. The app is not broken, the probe budget is too small.
4. **Fix and prove:** delete the Pod and recreate it with this added to the container (keep the liveness probe):

```yaml
      startupProbe: {exec: {command: ["cat","/tmp/alive"]}, periodSeconds: 5, failureThreshold: 10}
```

   - `sleep 45` then `kubectl get pod lab-slow -n $NS` → `1/1`, `RESTARTS 0`.
5. **Clean up:**

```bash
kubectl delete pod lab-probes lab-slow -n $NS; kubectl delete svc lab-probes -n $NS
```

6. **Your turn:** compute the startup budget on Apollo's `booking` (`periodSeconds × failureThreshold`). The Go service starts in about a second. Is the budget too large, too small, or fine, and what would a Postgres Pod that replays WAL for 90 s need?

<details>
<summary>Answer</summary>

5 s × 6 = 30 s, comfortable for booking. A slow Postgres would need `failureThreshold × periodSeconds` ≥ 90 s (for example 20 × 5 s) so liveness never starts too early.
</details>

---

## Exercise 3: Break it: a dependency outage on the real booking service

**Goal:** use the probes you just studied on Apollo itself, and see *unready, not restarted*.
**Time:** ~8 min

1. **Predict:** `booking-db` is stopped. Do booking Pods restart? What does a passenger's request return?
2. **Baseline:**

```bash
NS=apollo-airlines-apps
GW=$(kubectl get gateway apollo-gateway -n $NS -o jsonpath='{.status.addresses[0].value}')
B() { curl -s -o /dev/null -m 3 -w "$1 -> %{http_code}\n" -H "Host: booking.apollo.local" http://$GW$1; }
B /healthz/live; B /healthz/ready
```

3. **Inject (the PVC is untouched):**

```bash
kubectl scale sts/booking-db -n $NS --replicas=0
sleep 20
kubectl get pods -n $NS -l app=booking
B /healthz/live; B /healthz/ready
kubectl get endpointslice -n $NS -l kubernetes.io/service-name=booking -o jsonpath='{range .items[*].endpoints[*]}ready={.conditions.ready}{"\n"}{end}'
kubectl exec -n $NS deploy/booking -- wget -qO- http://127.0.0.1:8082/healthz/live
kubectl exec -n $NS deploy/booking -- wget -qO- http://127.0.0.1:8082/healthz/ready ; true
```

4. **Symptom:** booking Pods `0/1`, **`RESTARTS 0`**. Through the Gateway both paths return `503` (no ready endpoint). Inside the Pod, `live` answers and `ready` fails with `DB not reachable`.
5. **Diagnose:** liveness OK + readiness failing + `RESTARTS 0` ⇒ the process is fine, a dependency is not. Restarting booking would not help.
6. **Recover and prove:**

```bash
kubectl scale sts/booking-db -n $NS --replicas=1
kubectl wait --for=condition=Ready pod/booking-db-0 -n $NS --timeout=120s
sleep 10; kubectl get pods -n $NS -l app=booking
B /healthz/ready
```

   - `1/1`, `RESTARTS 0`, `200`. Earlier bookings are still in the database (PVC).
7. **Why:** this is the Launchpad Exercise 5 outage, now handled by the kubelet correctly: stop sending traffic, do not restart.
8. **Your turn:** the legacy `/readyz` endpoint also checks flight, identity and notification; `/healthz/ready` only checks the database. Which is the worse readiness probe for a service with an optional notification dependency, and why?

<details>
<summary>Answer</summary>

`/readyz`: a notification outage would mark every booking Pod unready and take the whole service out of rotation, even though bookings still succeed (Launchpad Exercise 5, fault C). Readiness should include only what the request path needs to answer correctly.
</details>

---

## Exercise 4: Shutdown timing, a stubborn process, and a rollout under load

**Goal:** measure the shutdown sequence and compare a graceful process with one that ignores SIGTERM.
**Time:** ~20 min

### 4A: measure preStop → SIGTERM

1. **Predict:** you delete a booking Pod. With `preStop: sleep 5`, how many seconds pass before the app logs its SIGTERM message?
2. **Do:**

```bash
NS=apollo-airlines-apps
P=$(kubectl get pod -n $NS -l app=booking -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n $NS $P -f --timestamps > /tmp/term.log 2>&1 &
LP=$!
date -u +"delete issued: %T"
kubectl delete pod -n $NS $P --wait=false
sleep 12; kill $LP
grep -iE "SIGTERM|shut" /tmp/term.log
kubectl get pods -n $NS -l app=booking
```

3. **Check:** the SIGTERM log timestamp is about 5 s after "delete issued" (both in UTC). A replacement Pod is already starting. The old Pod was `Terminating` the whole time.
4. **Why:** API server marks `Terminating` → endpoint removal starts → kubelet runs `preStop` (5 s) → SIGTERM → app drains → exit. The 5 s is the head start for the endpoint change to spread.

### 4B: a process that ignores SIGTERM

1. **Predict:** a container whose main process is `sh -c 'sleep 1000'`, with `terminationGracePeriodSeconds: 10`. How long does `kubectl delete` take?
2. **Do:**

```bash
kubectl apply -n $NS -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata: {name: lab-stubborn}
spec:
  terminationGracePeriodSeconds: 10
  containers: [{name: c, image: busybox:1.36.1, command: ["sh","-c","sleep 1000"]}]
YAML
kubectl wait --for=condition=Ready pod/lab-stubborn -n $NS --timeout=60s
time kubectl delete pod lab-stubborn -n $NS
```

3. **Check:** about 10 s: the kubelet waited out the grace period, then sent SIGKILL.
4. **Fix and prove:** recreate it with `command: ["sh","-c","trap 'exit 0' TERM; sleep 1000 & wait"]`, then `time kubectl delete pod lab-stubborn -n $NS` → about 1 s.
5. **Why:** PID 1 in a container has no default signal handling; unless the app handles SIGTERM, every shutdown costs the whole grace period and ends in `137`. Apollo's Go services handle it explicitly (`srv.Shutdown`).

### 4C: rollouts under load

1. **Predict:** you restart booking while 120 requests flow through the Gateway. How many fail?
2. **Do:**

```bash
GW=$(kubectl get gateway apollo-gateway -n $NS -o jsonpath='{.status.addresses[0].value}')
run() { for i in $(seq 1 120); do curl -s -o /dev/null -m 2 -w '%{http_code}\n' -H "Host: booking.apollo.local" http://$GW/healthz/live; sleep 0.25; done | sort | uniq -c; }
run > /tmp/roll.out &
sleep 2; kubectl rollout restart deploy/booking -n $NS; kubectl rollout status deploy/booking -n $NS
wait; cat /tmp/roll.out
```

3. **Check:** `120 200` (or very close). A new Pod receives traffic only after readiness, and the old one lingers (`preStop`) while endpoints update.
4. **Your turn (measurement):** remove the hook and compare.

```bash
kubectl patch deploy booking -n $NS --type json -p '[{"op":"remove","path":"/spec/template/spec/containers/0/lifecycle"}]'
kubectl rollout status deploy/booking -n $NS
run > /tmp/roll2.out &
sleep 2; kubectl rollout restart deploy/booking -n $NS; kubectl rollout status deploy/booking -n $NS
wait; cat /tmp/roll2.out
kubectl apply -f stages/stage4/k8s/apps/booking/booking-dep.yaml     # restore the hook
```

   - Record both counts. On a lightly loaded laptop the difference may be zero or a few `000`/`503`. State what you measured; do not assume. What would you change in the test to expose the gap?

<details>
<summary>Answer</summary>

A higher request rate and more samples, so some requests are in flight at the instant a Pod receives SIGTERM. The effect is a race: the hook narrows the window, it never proves zero failures.
</details>

---

## Exercise 5: Requests, QoS and a Pod that cannot fit

**Goal:** show requests as a scheduling promise, and QoS as an eviction ranking.
**Time:** ~10 min

1. **Predict:** you create a Pod requesting 100 CPUs. Status? Which component says no? Does real CPU use matter?
2. **Inject:**

```bash
NS=apollo-airlines-apps
kubectl apply -n $NS -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata: {name: lab-huge}
spec:
  containers: [{name: c, image: busybox:1.36.1, command: ["sleep","3600"], resources: {requests: {cpu: "100"}}}]
YAML
sleep 5
kubectl get pod lab-huge -n $NS -o wide
kubectl describe pod lab-huge -n $NS | sed -n '/^Events:/,$p'
```

3. **Symptom:** `Pending`, `FailedScheduling … Insufficient cpu`.
4. **Diagnose:** compare what nodes offer with what is already requested:

```bash
kubectl describe node apollo11-worker | sed -n '/Allocated resources/,/Events/p'
```

   - The `Requests` sum includes every Pod's request, busy or idle. "Insufficient" is judged on **requests**, not on actual usage.
5. **Fix:** delete and recreate it with `cpu: 50m`. It runs. `kubectl get pod lab-huge -n $NS -o jsonpath='{.status.qosClass}{"\n"}'` → `Burstable` (a request without a limit).
6. **Rank three Pods yourself:**

| Pod spec | QoS class |
|---|---|
| no requests or limits | ? |
| requests 50m, no limits | ? |
| requests = limits for CPU and memory | ? |

   - Answers: `BestEffort`, `Burstable`, `Guaranteed`. Under node memory pressure the kubelet evicts in that order.
7. **Clean up:** `kubectl delete pod lab-huge -n $NS`.
8. **Your turn:** exceeding a memory **limit** kills the container instantly (`OOMKilled`, exit 137); exceeding a CPU limit only slows it. Create a Pod with `limits.memory: 30Mi` that allocates more, and find the evidence in `kubectl get pod -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'`.

<details>
<summary>Hint</summary>

Write a few tens of MB into a memory-backed path: `sh -c 'head -c 60m /dev/zero > /dev/shm/x; sleep 3600'`. Expect `OOMKilled`. This depends on your kernel's cgroup accounting, so record what you actually see.
</details>

---

## Exercise 6: What a PDB does and does not stop

**Goal:** separate voluntary eviction (budgeted) from deletion (not budgeted).
**Time:** ~12 min · **Needs:** 2 healthy `booking` Pods.

1. **Predict:** with 2 replicas and `minAvailable: 1`, can you evict both Pods back to back? Can you `kubectl delete` both?
2. **Do:**

```bash
NS=apollo-airlines-apps
kubectl get pdb booking-pdb -n $NS
evict() { kubectl create --raw "/api/v1/namespaces/$NS/pods/$1/eviction" -f - <<JSON
{"apiVersion":"policy/v1","kind":"Eviction","metadata":{"name":"$1","namespace":"$NS"}}
JSON
}
PODS=($(kubectl get pod -n $NS -l app=booking -o jsonpath='{.items[*].metadata.name}'))
evict ${PODS[0]}      # first eviction
evict ${PODS[1]}      # immediately after
```

3. **Check:**
   - PDB: `ALLOWED DISRUPTIONS 1`.
   - The first call succeeds. The second fails: `Cannot evict pod as it would violate the pod disruption budget` (HTTP 429).
4. **Prove the budget recovers:**

```bash
kubectl rollout status deploy/booking -n $NS
kubectl get pdb booking-pdb -n $NS      # ALLOWED DISRUPTIONS back to 1
```

5. **What a PDB does not stop:**

```bash
kubectl scale deploy/booking -n $NS --replicas=1
kubectl rollout status deploy/booking -n $NS
kubectl get pdb booking-pdb -n $NS                       # ALLOWED DISRUPTIONS 0
evict $(kubectl get pod -n $NS -l app=booking -o jsonpath='{.items[0].metadata.name}')     # refused
kubectl delete pod -n $NS -l app=booking                  # NOT refused
kubectl scale deploy/booking -n $NS --replicas=2
kubectl rollout status deploy/booking -n $NS
```

   - Eviction refused; `delete` succeeds, and booking has no ready Pod for a few seconds.
6. **Why:** PDBs are consulted by the Eviction API only (`kubectl drain`, cluster upgrades, autoscaler). Deletes, scale-downs, node crashes and OOM kills bypass them. A PDB expresses intent for planned maintenance, not an availability guarantee.
7. **Your turn:** `kubectl drain` uses the Eviction API. Without running it, predict what happens to `booking-db-0` if you drain the node holding its local-path volume (revisit Stage 3 Exercise 5), and why a PDB on the databases would not help.

<details>
<summary>Answer</summary>

The DB Pod is evicted and then stays `Pending` (volume node affinity) until the node is uncordoned. A PDB only gates the eviction; it cannot make storage portable.
</details>

---

## Clean-up and baseline

```bash
kubectl get pods -n apollo-airlines-apps | grep lab- || echo "no lab pods left"
kubectl get deploy -n apollo-airlines-apps
bash stages/stage4/scripts/verify.sh
```

## You can now

- [ ] Predict the kubelet's action for a startup, readiness or liveness failure.
- [ ] Explain why shutdown needs both a `preStop` delay and SIGTERM handling, and what ignoring SIGTERM costs.
- [ ] Read a `FailedScheduling … Insufficient cpu` event and know requests drove it.
- [ ] Rank Pods by QoS and say what a PDB does not cover.

## Checkpoint

1. Readiness fails. Does the kubelet restart the container?
2. A Pod takes exactly its grace period to terminate. What does that suggest?
3. Which resource setting makes a Pod `Guaranteed`?
4. Name three disruptions a PDB will **not** block.

Next: [Stage 5: Payload Integration](./stage-5).
