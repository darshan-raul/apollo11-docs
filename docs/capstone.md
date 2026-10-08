---
title: "Apollo11 Core Capstone"
description: "An on-call drill for the Stage 7 platform: baseline it, diagnose an unknown fault, prove durability, and audit what is not yet secured."
sidebar_label: "Core Capstone"
---

# Capstone: operate what exists

:::info[Page type · assessed lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Local path only: Ignition → Stage 7.
- Security and cloud controls are *planned*; the audit in Mission 5 keeps them labelled that way.
- Optional read-first: [A Passenger's Booking](./learn/capstone/a-booking-through-kubernetes).
- Stuck on a mission? Refresh: [reconciliation](./learn/cluster/reconciliation-and-components) · [Services and readiness](./learn/workloads/services-and-readiness) · [probes](./learn/reliability/probes) · [volume lifetimes](./learn/storage/volume-lifetimes) · [correlating a booking](./learn/observability/correlating-a-booking).
:::

**You are the on-call engineer.** You will establish a baseline, take a request apart, diagnose a fault you did not choose, prove what survives a database restart, and audit what the platform does not yet protect.

**Pass criteria:** for every mission you can say *which object or controller caused the outcome* and show the command that proves it.

---

## Mission 1: Build the system and write a "known-good card"

**Goal:** capture the baseline you will compare against during the incident.
**Time:** ~20 min

1. **Do:**

```bash
kind get clusters | grep -qx apollo11 || kind create cluster --config stages/ignition/kind-config.yaml
kubectl config use-context kind-apollo11
bash stages/stage7/scripts/apply.sh --mode helm --env dev
bash stages/stage7/scripts/verify.sh --mode helm --env dev
```

2. **Write the card.** Run these and keep the output in a file (`learner-work/capstone/known-good.txt`):

```bash
mkdir -p learner-work/capstone
{
  echo "## deploy";  kubectl get deploy,sts -n apollo-airlines-apps
  echo "## svc/endpoints"; kubectl get endpoints -n apollo-airlines-apps
  echo "## pvc";     kubectl get pvc -n apollo-airlines-apps
  echo "## hpa";     kubectl get hpa -n apollo-airlines-apps
  echo "## gateway"; kubectl get gateway -n apollo-airlines-apps
} | tee learner-work/capstone/known-good.txt | head -40
```

3. **Check:** everything `Ready`; each Service has an endpoint; PVCs `Bound`; Gateway `Programmed`. Dev has 1 replica per app, HPA 1–3, no VPA, no PDBs.
4. **Why:** you cannot call something "broken" without a record of "working". Mission 3 uses this file.
5. **Your turn:** add one line to the card that proves a passenger can actually book (not just that Pods are Ready). Keep that command; it is your final acceptance test.

<details>
<summary>Example</summary>

```bash
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
TOKEN=$(curl -s -H "Host: identity.apollo.local" -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' http://$GW/api/users/login | jq -r .token)
curl -s -o /dev/null -w 'book -> %{http_code}\n' -X POST -H "Host: booking.apollo.local" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' http://$GW/api/bookings
```
Expect `201`. Cancel with `DELETE /api/bookings/<id>` afterwards to restore the seat.
</details>

---

## Mission 2: Follow one booking across every boundary

**Goal:** produce one piece of evidence per hop for a single request.
**Time:** ~15 min

1. **Predict:** list the hops in order (DNS/Host → Gateway → Service → Pod → identity → flight → DB → notification). Which hop does each of these prove: Gateway `Programmed=True`, a non-empty EndpointSlice, a `201`, a Tempo trace with four services?
2. **Do:**

```bash
bash stages/stage7/scripts/trace-test.sh
```

   - Keep the `trace_id=… services=…` line.
3. **Fill the table from live commands:**

| Hop | Evidence command | Result you saw |
|---|---|---|
| Edge listener | `kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.conditions[*].type}={.status.conditions[*].status}'` | |
| Route accepted | `kubectl get httproute booking -n apollo-airlines-apps -o jsonpath='{.status.parents[0].conditions[*].type}'` | |
| Ready endpoint | `kubectl get endpointslice -n apollo-airlines-apps -l kubernetes.io/service-name=booking -o jsonpath='{.items[0].endpoints[*].conditions.ready}'` | |
| Cross-service call | `trace_id` / services list | |

4. **Why:** each fact is independent. Config accepted ≠ proxy listening ≠ this request matched ≠ the downstream call worked.
5. **Your turn:** the trace covers `booking`, `identity`, `flight`, `notification`. Which of the four calls does booking make *synchronously* and which asynchronously, and how does the trace show that?

<details>
<summary>Answer</summary>

Identity and flight are called before the response is built; notification is called after the booking row is written and does not delay the response. In the trace, the notification span starts after the booking's DB work and is not on the critical path.
</details>

---

## Mission 3: The unknown-fault drill

**Goal:** diagnose a fault you did not read about, using only the evidence ladder, then fix it and prove recovery.
**Time:** ~25 min per round (repeat for different faults)

**Rules:** do not open "Answer key" before you have named the failing component and shown the evidence.

1. **Inject a random fault (this hides which one):**

```bash
NS=apollo-airlines-apps
F=$((RANDOM % 4)); echo $F > /tmp/.apollo-fault
case $F in
  0) kubectl patch svc flight -n $NS -p '{"spec":{"selector":{"app":"flightt"}}}' ;;
  1) kubectl scale sts/booking-db -n $NS --replicas=0 ;;
  2) kubectl set image deploy/booking booking=apollo11/booking:v999-missing -n $NS ;;
  3) kubectl scale deploy/identity -n $NS --replicas=0 ;;
esac >/dev/null
echo "A fault is injected. Do not read /tmp/.apollo-fault yet."
```

2. **Symptom check (the passenger's view):** run your acceptance test from Mission 1. Write down the status code and body.
3. **Diagnose with the ladder, in order, writing one line per rung:**
   1. Snapshot: `kubectl get deploy,sts,pods,endpoints -n $NS` vs your known-good card (`diff` the outputs).
   2. Events: `kubectl get events -n $NS --sort-by=.lastTimestamp | tail -15`.
   3. Detail: `kubectl describe` the suspicious object.
   4. Logs: `kubectl logs -n $NS deploy/<name> --tail=20` for each hop the request touches.
   5. Endpoint: curl each service's `/healthz` and `/readyz` through the Gateway (Host header).
4. **State your diagnosis in one sentence in the form:** "*component* failed because *reason*, shown by *evidence*."
5. **Fix it with the smallest change, then prove recovery:** re-run the acceptance test and `diff` against the known-good card.
6. **Reveal and compare:**

```bash
cat /tmp/.apollo-fault
```

<details>
<summary>Answer key</summary>

| Fault | Symptom | Decisive evidence | Fix |
|---|---|---|---|
| 0 selector typo on `flight` | Booking `502 Flight service unavailable`; flight Pods `Ready` | `get endpoints flight` → `<none>`; Service selector `app=flightt` | `kubectl patch svc flight … '{"spec":{"selector":{"app":"flight"}}}'` |
| 1 `booking-db` stopped | Booking readiness `503`, endpoints not ready, **no restarts** | `get sts booking-db` 0/0; booking `/healthz/ready` → `DB not reachable`; PVC still `Bound` | `kubectl scale sts/booking-db --replicas=1` |
| 2 bad booking image | Old Pod still serves; new Pod `ErrImagePull`; booking works but rollout stuck | `get rs` two ReplicaSets; events from kubelet | `kubectl rollout undo deploy/booking` |
| 3 `identity` stopped | Login `503/000`; booking fails at the identity step | `get deploy identity` 0/0; no endpoints | `kubectl scale deploy/identity --replicas=1` |

Related lessons: 0 = Stage 1 Ex.4 · 1 = Stage 4 Ex.3 · 2 = Stage 1 Ex.6A · 3 = Stage 2 Ex.2.
</details>

7. **Your turn:** run the drill again until you have seen all four, and for each write the *first command* you would run next time, to cut your diagnosis to under two minutes.

---

## Mission 4: Prove what survives a database restart

**Goal:** show durability across Pod replacement, and name what would lose the data.
**Time:** ~10 min

1. **Predict:** `booking-db-0` is deleted. Is a row you wrote still there? What if you delete the PVC?
2. **Do:**

```bash
NS=apollo-airlines-apps
P() { kubectl exec -n $NS booking-db-0 -- psql -U postgres -d booking -tAc "$1"; }
P "INSERT INTO bookings (id, booking_reference, user_id, flight_id, seat_number, status) VALUES ('88888888-8888-4888-8888-888888888888','CAPSTONE-PERSIST-1','b2c3d4e5-f6a7-8901-bcde-f12345678901','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','LAB-1B','CONFIRMED');"
kubectl get pod booking-db-0 -n $NS -o jsonpath='{.metadata.uid}{"\n"}'
kubectl delete pod booking-db-0 -n $NS && kubectl wait --for=condition=Ready pod/booking-db-0 -n $NS --timeout=120s
kubectl get pod booking-db-0 -n $NS -o jsonpath='{.metadata.uid}{"\n"}'
P "SELECT booking_reference FROM bookings WHERE booking_reference='CAPSTONE-PERSIST-1';"
kubectl get pvc pg-data-booking-db-0 -n $NS
P "DELETE FROM bookings WHERE booking_reference='CAPSTONE-PERSIST-1';"
```

3. **Check:** UID changed (new Pod), row survives, PVC `Bound` the whole time.
4. **Why:** the claim, not the Pod, owns the data (Stage 3). This proves persistence across **Pod replacement on one node**, nothing more.
5. **Your turn:** list three events that would still lose this data on this cluster, and for each the control that would be needed (hint: PVC deletion, node loss, `DROP TABLE`/bad migration).

<details>
<summary>Answer</summary>

PVC deletion (reclaim `Delete`) → backup/`Retain`; node loss (local-path volume is on one node) → replication or network storage; logical corruption → point-in-time backup you have actually restored.
</details>

---

## Mission 5: Audit: demonstrated versus planned

**Goal:** report exactly what controls exist, with evidence, and list the gaps.
**Time:** ~10 min

1. **Do:**

```bash
kubectl get pods -n apollo-airlines-apps -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl get pods -n apollo-airlines-ui   -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl get pdb -A
kubectl get sa booking -n apollo-airlines-apps -o jsonpath='automount={.automountServiceAccountToken}{"\n"}'
kubectl get deploy booking -n apollo-airlines-apps -o yaml | grep -E 'runAsNonRoot|readOnlyRootFilesystem|seccompProfile' || echo "no container hardening fields on booking"
kubectl get networkpolicy -A 2>&1 | head -3
```

2. **Fill in the audit table:**

| Control | Present? | Evidence |
|---|---|---|
| Guaranteed QoS on app/data Pods | | |
| PodDisruptionBudgets in dev | | |
| Token automount disabled | | |
| Container hardening (`runAsNonRoot`, read-only rootfs, seccomp) | | |
| NetworkPolicy enforced | | |
| Secrets from a secret manager | | |
| Admission policy | | |

3. **Check:** QoS `Guaranteed` for the ten workloads (add-on Pods differ: state the selector you used); **no** PDBs in dev; `automount=false`; **no** hardening fields, no NetworkPolicy, secrets are plain Kubernetes Secrets, no admission policy. Those are Stage 8 *plans*.
4. **Why:** a control from one stage does not carry forward automatically, and a plan is not a control.
5. **Your turn:** write the sentence you would put in a handover note: "This platform is production-*shaped* but not production-ready because…" using at least four rows from your table.

---

## Clean-up and defence

```bash
rm -rf learner-work/capstone /tmp/.apollo-fault
bash stages/stage7/scripts/teardown.sh --mode helm --env dev --purge
kubectl get namespace apollo-airlines-apps apollo-airlines-ui apollo-observability   # all NotFound
```

Answer without notes:

1. Which controller recreated each Pod you deleted or broke?
2. Which object kept the database's data, and what would still lose it?
3. For your drill fault: which rung found it, and which rung would have found it faster?
4. Name two controls that are demonstrated and two that are only planned.
5. Why is "all Pods Ready" not the same as "a passenger can book"?

References: [command reference](./command-reference) · [troubleshooting](./troubleshooting) · [glossary](./glossary)
