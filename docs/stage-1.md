---
title: "Stage 1 — Liftoff: Workloads on Kubernetes"
description: "Deploy the ten Apollo workloads and learn to diagnose the failures controllers, Services, config and rollouts produce."
sidebar_label: "Stage 1: Liftoff (Workloads)"
---

# Build Stage 1: Liftoff

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run from the repo root.
- Needs: the `kind-apollo11` cluster from [Ignition](./ignition). Namespace: `apollo-airlines`.
- Read the [Liftoff chapters](./learn/workloads/ownership-and-replicas) first.
:::

**Skill this lab builds:** given a broken workload, decide in one command whether the fault is the **controller** (wrong count), the **selector** (no endpoints), the **config** (Pod runs but is not Ready) or the **image** (Pod never starts).

## Architecture in one view

| Object | Apollo example | Job |
|---|---|---|
| Deployment → ReplicaSet → Pods | `booking` ×2 | Keep N Pods; roll versions |
| Service (NodePort here) | `booking` :8082 → node port 30082 | Stable name + ready endpoints |
| ConfigMap `apollo-airlines-config` | `FLIGHT_SERVICE_URL=http://flight:8081` | Non-secret settings |
| Secret `apollo-airlines-secrets` | `JWT_SECRET`, `POSTGRES_PASSWORD` | Credentials |
| ServiceAccount ×13 | `booking`, `init-booking-db` … | Pod identity (`automountServiceAccountToken: false`) |
| Job ×3 | `init-booking-db` | Run schema SQL once |
| Deployment + `emptyDir` | `booking-db` | **Temporary** DB storage (fixed in Stage 3) |

Two relationships to keep apart for the whole stage:

| Relationship | Field | Who uses it |
|---|---|---|
| **Ownership** | `metadata.ownerReferences` | Garbage collection; "who made this" |
| **Selection** | `labels` ↔ `selector` | ReplicaSet counting; Service endpoints |

---

## Exercise 1: Deploy and prove it works

**Goal:** apply Stage 1, then show it works at every evidence rung.
**Time:** ~10 min

1. **Predict:** after `apply.sh` returns, which objects prove the app runs? (Hint: not `apply`.)
2. **Do:**

```bash
kubectl config current-context        # kind-apollo11
bash stages/stage1/scripts/apply.sh
kubectl get deploy,job,svc -n apollo-airlines
```

   - `apply.sh` applies in dependency order: config → databases and Redis → wait → schema Jobs → six app Deployments → wait.
   - Applying out of order gives `CreateContainerConfigError` (missing ConfigMap or Secret).
3. **Check:**
   - 10 Deployments available (`2/2` apps, `1/1` databases and Redis).
   - 3 Jobs `Complete 1/1`.
   - Services are `NodePort` on `30080`–`30084`.
4. **Prove the passenger path (rung 5):**

```bash
TOKEN=$(curl -s -X POST localhost:30080/api/users/login -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -r .token)
curl -s -X POST localhost:30082/api/bookings -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' | jq '{bookingReference,status}'
```

   - Expect `"status": "CONFIRMED"`. Keep `$TOKEN` for later exercises.
5. **Maintainer check:** `bash stages/stage1/scripts/verify.sh` (167 checks, weakest to strongest evidence).
6. **Your turn:** write `learner-work/stage1/booking-internal.yaml`, a **ClusterIP** Service named `booking-internal` on port 8082 that selects the booking Pods. Apply it, then prove it works from *inside* the cluster:

```bash
kubectl run curl --rm -it --restart=Never -n apollo-airlines --image=curlimages/curl -- \
  curl -s http://booking-internal:8082/healthz
```

<details>
<summary>Solution</summary>

```yaml
apiVersion: v1
kind: Service
metadata:
  name: booking-internal
  namespace: apollo-airlines
spec:
  selector:
    app: booking
  ports:
    - port: 8082
      targetPort: 8082
```
Expect `{"status":"ok"}`. Delete it afterwards: `kubectl delete svc booking-internal -n apollo-airlines`.
</details>

---

## Exercise 2: Labels select, owners own: quarantine a Pod

**Goal:** separate selection from ownership by pulling one Pod out of service while keeping it alive.
**Time:** ~10 min

1. **Predict:** you change the `app` label on one booking Pod. (a) Does the ReplicaSet create a replacement? (b) Does the old Pod die? (c) Does the Service still send it traffic?
2. **Do:**

```bash
kubectl get rs -n apollo-airlines -l app=booking
P=$(kubectl get pod -n apollo-airlines -l app=booking -o jsonpath='{.items[0].metadata.name}')
kubectl get pod $P -n apollo-airlines -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}{"\n"}'
kubectl get endpoints booking -n apollo-airlines

kubectl label pod $P -n apollo-airlines app=booking-quarantine --overwrite
sleep 5
kubectl get pods -n apollo-airlines -l 'app in (booking,booking-quarantine)' -L app
kubectl get pod $P -n apollo-airlines -o jsonpath='ownerRefs={.metadata.ownerReferences}{"\n"}'
kubectl get endpoints booking -n apollo-airlines
```

3. **Check:**
   - First line: `ReplicaSet/booking-<hash>`. Endpoints list 2 addresses.
   - After relabel: **3 Pods** (2 `booking`, 1 `booking-quarantine`). The quarantined Pod is still `Running`.
   - Its `ownerReferences` is empty (the ReplicaSet released it). Endpoints still list exactly 2 addresses, none of them the quarantined Pod's IP.
4. **Use it:** the Pod is out of rotation but alive, so you can inspect it without live traffic.

```bash
kubectl exec -n apollo-airlines $P -- wget -qO- http://127.0.0.1:8082/healthz
kubectl logs -n apollo-airlines $P --tail=3
```

5. **Clean up:** `kubectl delete pod $P -n apollo-airlines`.
6. **Why:**
   - The ReplicaSet counts Pods **matching its selector**. A relabelled Pod no longer matches, so it is released and a replacement is created.
   - The Service builds endpoints from the **same labels**, not from ownership.
   - This is a real operations technique: quarantine a misbehaving Pod for debugging while capacity is restored.
7. **Your turn:** repeat steps 2–3 but **skip the clean-up**. Instead, relabel the quarantined Pod back to `app=booking`. Predict how many booking Pods exist 10 s later and which one is removed.

<details>
<summary>Answer</summary>

The ReplicaSet re-adopts the matching Pod (`ownerReferences` set again). It now sees 3 matching Pods against `replicas: 2`, so it deletes one, usually the newest. Desired count always wins.
</details>

---

## Exercise 3: Replace a Pod under live traffic

**Goal:** show that the Pod's name, IP and UID change while the Service address does not, and measure the gap.
**Time:** ~8 min

1. **Predict:** you delete one of two booking Pods while requests flow. How many requests fail? What stays identical?
2. **Record the "before":**

```bash
kubectl get svc booking -n apollo-airlines -o jsonpath='clusterIP={.spec.clusterIP}{"\n"}'
kubectl get pods -n apollo-airlines -l app=booking -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,IP:.status.podIP
```

3. **Run traffic and delete a Pod:**

```bash
(for i in $(seq 1 60); do curl -s -m 1 -o /dev/null -w '%{http_code} ' localhost:30082/healthz; sleep 0.25; done; echo) &
sleep 2
kubectl delete pod -n apollo-airlines "$(kubectl get pod -n apollo-airlines -l app=booking -o jsonpath='{.items[0].metadata.name}')"
wait
```

4. **Check:**
   - The loop prints mostly `200`. A stray `000` right at deletion is possible. It is the routing race Stage 4 (`preStop`) removes.
   - Re-run the "before" commands: one Pod has a new name, UID and IP. **The ClusterIP is unchanged.**
   - `kubectl get pods -l app=booking` shows 2 Pods again within seconds (the new one is `0/1` until its readiness probe passes).
5. **Why:**
   - The ReplicaSet saw 1 < 2 and created a Pod. The scheduler placed it; the kubelet started it; readiness added it to the Service.
   - Callers use the Service name, so Pod identity does not matter to them. Compare Ignition Exercise 6: same delete, no controller, no replacement.
6. **Your turn:** scale to 4 and then back to 2 with `kubectl scale`. For each change, read `kubectl get endpoints booking` and list which Pods the ReplicaSet chooses to remove when scaling down. Why is a not-yet-ready Pod removed first?

<details>
<summary>Answer</summary>

Scale-down ranks candidates: unscheduled, then not-ready, then newer. Removing a Pod that serves no traffic costs the least.
</details>

---

## Exercise 4: Break it: a Service with no endpoints

**Goal:** diagnose the quietest failure in the stage, a selector that matches nothing.
**Time:** ~8 min

1. **Predict:** `kubectl apply` of a Service whose selector has a typo: does it error? Do Pods restart? What do callers see?
2. **Inject:**

```bash
kubectl patch svc booking -n apollo-airlines -p '{"spec":{"selector":{"app":"boking"}}}'
```

3. **Symptom:**

```bash
curl -m 3 -sS localhost:30082/healthz ; echo "exit=$?"
```

   - The request fails (reset, empty reply or timeout). No `kubectl` command reported an error.
4. **Diagnose.** Pods look healthy, so look at the Service's link to them (rungs 1 → 3):

```bash
kubectl get pods -n apollo-airlines -l app=booking          # 2/2 Ready: Pods are fine
kubectl get endpoints booking -n apollo-airlines            # ENDPOINTS: <none>
kubectl get svc booking -n apollo-airlines -o jsonpath='{.spec.selector}{"\n"}'
kubectl get pods -n apollo-airlines -l app=boking           # No resources found
kubectl get events -n apollo-airlines --sort-by=.lastTimestamp | tail -5   # nothing about it
```

   - `ENDPOINTS <none>` + a selector that selects zero Pods ⇒ selector/label mismatch.
   - **No event is emitted.** The control plane considers this valid.
5. **Fix and prove:**

```bash
kubectl patch svc booking -n apollo-airlines -p '{"spec":{"selector":{"app":"booking"}}}'
kubectl get endpoints booking -n apollo-airlines
curl -s localhost:30082/healthz
```

   - Two endpoints again; `{"status":"ok"}`.
6. **Why:**
   - Service → Pods is **only** the label selector. An empty endpoint list is the signature.
   - Reflex for "Service doesn't work": `get endpoints` first, then Pod `READY`, then ports.
7. **Your turn:** restore the selector, then change `targetPort` to `9999` instead. Endpoints will still show 2 addresses. What is different, and how would you find it?

<details>
<summary>Answer</summary>

Endpoints exist (they list `podIP:9999`), but nothing listens on 9999, so connections are refused. `kubectl get endpoints` shows the wrong port; `curl` inside a Pod against the Pod IP and port confirms it. Restore with `targetPort: 8082`.
</details>

---

## Exercise 5: Follow configuration into a Pod

**Goal:** trace one setting from its source object to the process, and show Secrets are encoded, not encrypted.
**Time:** ~8 min

1. **Predict:** where does `booking` get `FLIGHT_SERVICE_URL`? Where does `JWT_SECRET` come from? Is the Secret value hidden from someone who can `get` it?
2. **Do:**

```bash
kubectl get deploy booking -n apollo-airlines -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{" <- "}{.valueFrom}{"\n"}{end}'
P=$(kubectl get pod -n apollo-airlines -l app=booking -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n apollo-airlines $P -- printenv FLIGHT_SERVICE_URL PORT
kubectl get secret apollo-airlines-secrets -n apollo-airlines -o jsonpath='{.data.JWT_SECRET}' | base64 -d; echo
kubectl exec -n apollo-airlines $P -- ls /var/run/secrets/kubernetes.io/serviceaccount 2>&1 | head -1
```

3. **Check:**
   - `FLIGHT_SERVICE_URL <- configMapKeyRef …`, `JWT_SECRET <- secretKeyRef …`.
   - `printenv` shows `http://flight:8081` and `8082`.
   - `base64 -d` prints the plaintext secret to anyone who may `get secret`.
   - The ServiceAccount directory does not exist: `automountServiceAccountToken: false` means this Pod carries no API credential.
4. **Why:**
   - Env values are copied into the container **at start**. Editing the ConfigMap later changes nothing for a running Pod (proved in Exercise 6B).
   - Secret = base64, not encryption. Access control (RBAC) and encryption-at-rest are what protect it (Stage 8).
5. **Your turn:** `identity` also needs `JWT_SECRET`. Without opening the manifest, list every Deployment that references `apollo-airlines-secrets` and which keys each uses.

<details>
<summary>Answer</summary>

```bash
kubectl get deploy -n apollo-airlines -o json | jq -r '.items[] | .metadata.name as $n | .spec.template.spec.containers[].env[]? | select(.valueFrom.secretKeyRef) | "\($n) \(.valueFrom.secretKeyRef.key)"'
```
</details>

---

## Exercise 6: Break it: two bad releases, two different symptoms

**Goal:** tell *"image can't start"* from *"Pod runs but never becomes Ready"*, and learn why `rollout undo` fixes one but not the other.
**Time:** ~15 min

### 6A: bad image

1. **Predict:** you set a non-existent image tag. Do users see an outage?
2. **Inject:**

```bash
kubectl set image deploy/booking booking=apollo11/booking:v999-invalid -n apollo-airlines
kubectl rollout status deploy/booking -n apollo-airlines --timeout=25s ; true
kubectl get pods -n apollo-airlines -l app=booking
```

3. **Symptom:** a new Pod in `ErrImagePull` / `ImagePullBackOff`; 2 old Pods still `1/1`. The rollout is stuck.
4. **Diagnose:**

```bash
kubectl get rs -n apollo-airlines -l app=booking
kubectl describe pod -n apollo-airlines -l app=booking | grep -E 'Failed|BackOff|Image:' | head
curl -s -o /dev/null -w 'users still get %{http_code}\n' localhost:30082/readyz
```

   - Two ReplicaSets: old (2 ready) and new (1 desired, 0 ready). Events come from `kubelet`. Users get `200`.
5. **Fix:** `kubectl rollout undo deploy/booking -n apollo-airlines && kubectl rollout status deploy/booking -n apollo-airlines`
6. **Prove:** `kubectl get deploy booking -n apollo-airlines -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'` shows `apollo11/booking:latest`; 2/2 ready.

### 6B: bad configuration

1. **Predict:** you point `FLIGHT_SERVICE_URL` at a host that does not exist, then restart. (a) Do running Pods notice the ConfigMap edit? (b) Will the new Pod be `Running`? `Ready`?
2. **Inject:**

```bash
kubectl patch configmap apollo-airlines-config -n apollo-airlines --type merge -p '{"data":{"FLIGHT_SERVICE_URL":"http://flight-typo:8081"}}'
kubectl exec -n apollo-airlines "$(kubectl get pod -n apollo-airlines -l app=booking -o jsonpath='{.items[0].metadata.name}')" -- printenv FLIGHT_SERVICE_URL
kubectl rollout restart deploy/booking -n apollo-airlines
sleep 20; kubectl get pods -n apollo-airlines -l app=booking
```

3. **Symptom:** the old Pod printed the **old** value (a). The new Pod is `Running` but `0/1` (b). Users still get `200`.
4. **Diagnose:**

```bash
NEW=$(kubectl get pod -n apollo-airlines -l app=booking --sort-by=.metadata.creationTimestamp -o name | tail -1)
kubectl describe $NEW -n apollo-airlines | grep -E 'Readiness|Ready:|Restart'
kubectl exec -n apollo-airlines ${NEW#pod/} -- wget -qO- http://127.0.0.1:8082/readyz
kubectl logs -n apollo-airlines $NEW --tail=5
```

   - `Readiness probe failed … 503`. The container is alive (`Restart Count: 0`) but `/readyz` reports that it cannot reach flight.
5. **Try the obvious fix:** `kubectl rollout undo deploy/booking -n apollo-airlines`. Wait 20 s and look again.
   - Still `0/1`: the old template is restored, but new Pods read the **same broken ConfigMap**.
6. **Real fix and proof:**

```bash
kubectl patch configmap apollo-airlines-config -n apollo-airlines --type merge -p '{"data":{"FLIGHT_SERVICE_URL":"http://flight:8081"}}'
kubectl rollout restart deploy/booking -n apollo-airlines
kubectl rollout status deploy/booking -n apollo-airlines
curl -s -X POST localhost:30082/api/bookings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' | jq .status
```

   - `"CONFIRMED"`.
7. **Why (6A vs 6B):**

| | 6A bad image | 6B bad config |
|---|---|---|
| Pod status | `ImagePullBackOff` | `Running`, `0/1` |
| Reporter | kubelet (pull) | kubelet (readiness probe) |
| First command | `describe` → Events | `describe` → Conditions, then `/readyz` + logs |
| `rollout undo` | Fixes it | **Does not**: config lives outside the template |
| Users | Unaffected (old Pods serve) | Unaffected (readiness gates traffic) |

   - A rollout never removes a working Pod until its replacement is Ready. That is what turned both faults into non-outages.
8. **Your turn:** use `kubectl rollout history deploy/booking` and `kubectl rollout history deploy/booking --revision=<n>` to find which revision introduced the invalid image tag. Which field would you add to the Deployment so ConfigMap changes trigger a rollout automatically?

<details>
<summary>Answer</summary>

Each revision's template shows its image. To tie rollouts to config, put a hash of the ConfigMap in a Pod-template annotation. Helm and Kustomize generate this for you (Stage 5).
</details>

---

## Exercise 7: Lose a database with `emptyDir`

**Goal:** show what a Deployment replaces and what it cannot restore.
**Time:** ~10 min

1. **Predict:** you delete `booking-db`'s Pod. Does the Pod come back? Does the `bookings` table? Does the init Job rerun?
2. **Write a marker and confirm it:**

```bash
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "
  INSERT INTO bookings (id, booking_reference, user_id, flight_id, seat_number, status)
  VALUES ('99999999-9999-4999-8999-999999999999','TEMP-EMPTYDIR-1',
          'b2c3d4e5-f6a7-8901-bcde-f12345678901','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','LAB-1A','CONFIRMED');"
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -tc "SELECT booking_reference FROM bookings WHERE booking_reference='TEMP-EMPTYDIR-1';"
```

3. **Inject:**

```bash
kubectl delete pod -n apollo-airlines -l app=booking-db
kubectl wait --for=condition=Ready pod -l app=booking-db -n apollo-airlines --timeout=90s
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -c "SELECT count(*) FROM bookings;"
```

4. **Symptom:** `ERROR: relation "bookings" does not exist`. The Pod is back and `Ready`: Postgres is running with an **empty** data directory.
5. **Diagnose:**

```bash
kubectl get job init-booking-db -n apollo-airlines                  # still Complete 1/1, will not rerun
kubectl get deploy booking-db -n apollo-airlines -o jsonpath='{.spec.template.spec.volumes}{"\n"}'   # emptyDir
curl -s -o /dev/null -w 'booking readyz=%{http_code}\n' localhost:30082/readyz
```

   - Volume is `emptyDir`: lifetime = that Pod. Job is done: it never reruns.
   - `booking readyz=200` even though bookings cannot be saved: `/readyz` only pings the database, it does not check the schema. A green probe is not a working feature.
6. **Recover and prove:**

```bash
kubectl delete job init-booking-db -n apollo-airlines
kubectl apply -f stages/stage1/k8s/jobs/init-booking-db.yaml
kubectl wait --for=condition=Complete job/init-booking-db -n apollo-airlines --timeout=90s
kubectl exec -n apollo-airlines deploy/booking-db -- psql -U postgres -d booking -tc "SELECT count(*) FROM bookings;"
```

   - Table exists, `count` is `0`, and the marker booking is gone for good.
7. **Why:**
   - The Deployment faithfully replaced the **Pod**. It never promised the **data**.
   - A Job is "run to completion once"; it has no idea the database was reset.
   - This is the one-sentence case for Stage 3: separate the data's lifetime from the Pod's.
8. **Your turn:** write down (do not run) what a Pod spec must contain so this data survives, using only the words *claim*, *volume* and *mount*. Compare it with `stages/stage3/k8s` once you reach Stage 3.

---

## Clean-up and baseline

- Keep the stage running for Stage 2. Confirm baseline:

```bash
kubectl get deploy,job -n apollo-airlines
kubectl get configmap apollo-airlines-config -n apollo-airlines -o jsonpath='{.data.FLIGHT_SERVICE_URL}{"\n"}'   # http://flight:8081
```

- Remove everything: `bash stages/stage1/scripts/teardown.sh`.

## You can now

- [ ] Explain Deployment → ReplicaSet → Pod, and why labels and ownership are different.
- [ ] Diagnose an empty-endpoints Service in one command.
- [ ] Tell `ImagePullBackOff` from a Running-but-not-Ready Pod, and pick the right fix.
- [ ] Say precisely what `emptyDir` loses and why a Job will not repair it.

## Checkpoint

1. What does the ReplicaSet count: Pods it owns, or Pods matching its selector?
2. Service selector typo: what does `apply` print, and where do you see the problem?
3. Why did a ConfigMap edit not affect running Pods?
4. Why did the `booking-db` replacement start "healthy" but empty?

Next: [Stage 2: Guidance](./stage-2).
