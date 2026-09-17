---
title: "Apollo11 Core Capstone"
description: "Deploy, inspect, stress, recover, and audit the verified Stage 7 Apollo Airlines platform."
sidebar_label: "Core Capstone"
---

# Apollo11 Core Capstone: Operate What Exists

This capstone is not a larger verification checklist. It is one guided operator
story: establish what the Stage 7 system claims, follow a passenger workflow,
replace stateful and stateless pieces, observe how cache and autoscaling change
different decisions, and finish by naming the claims the local lab cannot make.

It combines the currently verified local path: Ignition through Stage 7. It
deliberately does not require the unimplemented security or cloud stages. Your
final task is not to declare the platform “production-ready”; it is to explain
which Kubernetes object or controller produced each observed outcome and to
identify the remaining gaps.

All commands are grounded in `stages/ignition/`, `stages/stage3/`, and
`stages/stage7/`. Run them from the Apollo11 repository root.

## Mission 1: establish the system you intend to investigate

Before testing a failure, establish the declared baseline. The apply script
creates desired state; it does not itself prove controllers, endpoints, or
telemetry have converged. Treat the verifier as a broad contract check, then
retain the live status as the baseline for later comparisons.

- **Objective**: Create the expected three-node kind cluster and deploy Stage 7
  in its workstation-sized dev configuration.
- **Starting point**: Docker is running; `kind`, `kubectl`, Helm, and the other
  repository prerequisites are installed. Remove or deliberately reuse any
  existing `apollo11` cluster before starting.
- **Instructions**:

```bash
cd Apollo11

kind get clusters | grep -qx apollo11 || \
  kind create cluster --config stages/ignition/kind-config.yaml
kubectl config use-context kind-apollo11

bash stages/stage7/scripts/apply.sh --mode helm --env dev
```

- **Expected result**: Application, UI, access-stack, and observability
  resources become ready. Dev uses one replica for each application initially,
  HPA range 1–3 for `search`, no VPA, and no PDBs.
- **Verification**:

```bash
bash stages/stage7/scripts/verify.sh --mode helm --env dev
```

  The current source records **211/211** checks for this mode. Treat the script's
  own final total as authoritative if that number changes.
- **Troubleshooting**: Start with `kubectl get pods -A`, then events,
  `describe`, logs, and endpoint behavior in that order. See the
  [troubleshooting guide](./troubleshooting).
- **Concept reinforced**: A successful apply starts verification; it does not
  replace it.

## Mission 2: follow one passenger workflow through the system

The next command creates and cancels a booking. Predict the distinction between
its two success claims: an HTTP transaction proves application behaviour, while
the Tempo check proves that the same request context crossed service boundaries.

- **Objective**: Execute booking and cancellation and prove that one trace
  crosses `booking`, `identity`, `flight`, and `notification`.
- **Starting point**: Mission 1 passes, including the observability stack.
- **Instructions**:

```bash
bash stages/stage7/scripts/trace-test.sh
```

- **Expected result**: The script prints progress for an in-cluster client,
  authentication, booking, Tempo lookup, and cancellation. Its final line
  confirms that the seat was restored and the four service names occur in one
  trace. The script intentionally cleans up its client Pod and cancels the
  booking; do not expect an active reservation afterward.
- **Verification**: Record the `trace_id=... services=...` line. Optionally
  port-forward Grafana and locate the same trace:

```bash
kubectl port-forward -n apollo-observability svc/grafana 3000:3000
```

  The chart enables anonymous Viewer access for this local lab.
- **Troubleshooting**: Inspect the temporary client error, then logs for the
  four services, OpenTelemetry Collector, and Tempo. A trace can arrive shortly
  after the HTTP response because export is asynchronous.
- **Concept reinforced**: Logs describe one process; a trace preserves causal
  context across service boundaries.

## Mission 3: replace a database Pod without replacing its claim

Stage 1 taught that a controller can restore a missing Pod. Stage 3 taught that
a StatefulSet can reconnect its ordinal Pod to a PVC. This mission asks you to
collect both pieces of evidence at once: a different Pod lifecycle and the same
named claim.

This is a minimal adaptation of the Stage 3 persistence exercise using the
current booking schema from
`stages/stage7/helm/apollo11/values.yaml`. The UUIDs and booking reference below
are lab-only data, not repository seed records.

- **Objective**: Prove that a Stage 7 PostgreSQL row survives database Pod
  replacement, then remove the lab row.
- **Starting point**: `booking-db-0` is Ready.
- **Instructions**:

```bash
# Insert and observe a unique lab row.
kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c "
    INSERT INTO bookings
      (id, booking_reference, user_id, flight_id, seat_number, status)
    VALUES
      ('88888888-8888-4888-8888-888888888888', 'CAPSTONE-PERSIST-1',
       'b2c3d4e5-f6a7-8901-bcde-f12345678901',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAB-1B', 'CONFIRMED');"

kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c \
  "SELECT booking_reference, status FROM bookings WHERE booking_reference='CAPSTONE-PERSIST-1';"

# Replace only the Pod; do not delete its PVC.
kubectl delete pod booking-db-0 -n apollo-airlines-apps
kubectl wait --for=condition=Ready pod/booking-db-0 \
  -n apollo-airlines-apps --timeout=120s

kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c \
  "SELECT booking_reference, status FROM bookings WHERE booking_reference='CAPSTONE-PERSIST-1';"

# Restore the seeded baseline.
kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c \
  "DELETE FROM bookings WHERE booking_reference='CAPSTONE-PERSIST-1';"
```

- **Expected result**: The row appears before and after Pod replacement, and
  the cleanup reports one deleted row.
- **Verification**:

```bash
kubectl get pvc pg-data-booking-db-0 -n apollo-airlines-apps
```

  The claim remains `Bound` through Pod replacement.
- **Troubleshooting**: If PostgreSQL says the relation is absent, inspect the
  StatefulSet, mounted PVC, and database logs before rerunning initialization.
  Do not delete the PVC as a recovery shortcut.
- **Concept reinforced**: This proves persistence across Pod replacement on
  kind's node-local provisioner. It does not prove node-loss recovery, backup,
  replication, or database high availability.

## Mission 4: separate a cache decision from a scaling decision

The first two requests ask the application whether it used Redis or `flight`.
The scheduling lab asks controllers to react to measured CPU and node rules.
They may occur in one platform, but they are separate mechanisms; interpret
their evidence separately.

- **Objective**: Prove cache MISS→HIT behavior, then run the repository's
  reversible HPA and scheduling lab.
- **Starting point**: Stage 7 is healthy and metrics-server returns `kubectl
  top nodes` data.
- **Instructions**:

```bash
GATEWAY_IP=$(kubectl get gateway apollo-gateway \
  -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
CACHE_DATE=$(date -u +%F)
SEARCH_URL="http://${GATEWAY_IP}/api/search?origin=BOM&destination=SIN&date=${CACHE_DATE}"

curl -i -H "Host: search.apollo.local" "$SEARCH_URL" | grep -i x-cache
curl -i -H "Host: search.apollo.local" "$SEARCH_URL" | grep -i x-cache

bash stages/stage7/scripts/scaling-lab.sh run
```

- **Expected result**: The repeated request changes from `MISS` to `HIT`. The
  script temporarily lowers the HPA threshold, produces real HTTP load, proves
  scale-out above the dev minimum, observes placement across at least two
  workers, returns to the minimum, and restores its changes.
- **Verification**:

```bash
kubectl get hpa search-hpa -n apollo-airlines-apps
kubectl get nodes --show-labels | grep 'apollo11.io/search-pool' || \
  echo "temporary search-pool label removed"
```

- **Troubleshooting**: If load fails to scale, inspect `kubectl top pods`, HPA
  conditions, and `FailedGetResourceMetric` events. If interrupted, run
  `bash stages/stage7/scripts/scaling-lab.sh cleanup`.
- **Concept reinforced**: Caching changes work per request; HPA changes replica
  count from measured load; scheduling policy decides placement. They solve
  different problems.

## Mission 5: observe a rollout without overclaiming availability

Dev starts `booking` with one replica and no PDB. Scale it to two for this
experiment, and remember that PDBs govern voluntary evictions—not Deployment
rolling-update availability.

This is an observation, not a “zero downtime” proof. The request sampler gives
you a bounded local result. Its timestamps become useful only when compared with
the Deployment, endpoint, Gateway, and application evidence if a request fails.

- **Objective**: Observe a Deployment rolling restart under bounded traffic and
  record whether the local run returns any non-200 readiness responses.
- **Starting point**: `GATEWAY_IP` is still set from Mission 4.
- **Instructions**:

In terminal 1:

```bash
failures=0
for request in $(seq 1 150); do
  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H 'Host: booking.apollo.local' \
    "http://${GATEWAY_IP}/healthz/ready" || true)
  if [ "$status" != 200 ]; then
    failures=$((failures + 1))
    printf 'request=%s status=%s\n' "$request" "${status:-curl-error}"
  fi
  sleep 0.1
done
printf 'non_200=%s\n' "$failures"
```

In terminal 2, while that loop runs:

```bash
kubectl scale deployment/booking -n apollo-airlines-apps --replicas=2
kubectl rollout status deployment/booking -n apollo-airlines-apps --timeout=120s
kubectl rollout restart deployment/booking -n apollo-airlines-apps
kubectl rollout status deployment/booking -n apollo-airlines-apps --timeout=120s
kubectl get pods -n apollo-airlines-apps -l app=booking -o wide

# Restore the dev value after the observation.
kubectl scale deployment/booking -n apollo-airlines-apps --replicas=1
```

- **Expected result**: The Deployment replaces Pods gradually and returns to
  Available. A zero value is the desired local observation, not a universal
  guarantee.
- **Verification**: Keep the `non_200` count and rollout output as evidence.
- **Troubleshooting**: For any failure, correlate its timestamp with Pod
  readiness, events, Envoy logs, and booking logs. Do not hide failures with
  `|| true` outside the request sampler.
- **Concept reinforced**: Readiness and rolling strategy protect traffic during
  updates. The dev environment has no PDB, and the Stage 7 chart does not define
  the Stage 4 `preStop` hook, so neither may be credited for this result.

## Mission 6: distinguish demonstrated controls from planned controls

The final audit is part of operating a real system. A resource setting is not a
property you inherit forever from an earlier stage. Inspect the Stage 7 rendered
workload, state exactly what it proves, and leave planned Stage 8 controls as
gaps rather than assumptions.

- **Objective**: Verify what Stage 7 actually configures and explicitly record
  what remains for Stage 8.
- **Starting point**: The cluster is healthy after Mission 5.
- **Instructions and verification**:

```bash
# The Stage 7 verifier checks equal CPU/memory requests and limits on the
# ten application/data workloads. Inspect their live Pod QoS classes.
kubectl get pods -n apollo-airlines-apps -l 'tier in (public,data)' \
  -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass'
kubectl get pods -n apollo-airlines-ui \
  -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass'

# Dev intentionally has no application PDBs.
kubectl get pdb -A

# Audit the ServiceAccount and Pod template fields instead of assuming them.
kubectl get serviceaccount booking -n apollo-airlines-apps -o yaml
kubectl get deployment booking -n apollo-airlines-apps -o yaml | \
  grep -E 'automountServiceAccountToken|runAsNonRoot|readOnlyRootFilesystem|seccompProfile' || \
  echo 'planned Stage 8 hardening fields are not present on this Deployment'
```

- **Expected result**: The ten charted workloads use equal requests and limits,
  but the Stage 7 snapshot does not prove the planned Stage 8 token, security
  context, NetworkPolicy enforcement, external-secret, or admission controls.
- **Troubleshooting**: Avoid broad statements such as “all Pods are
  Guaranteed”; add-on and temporary Pods can have different QoS. Always state
  the selector and workload set you inspected.
- **Concept reinforced**: An audit reports both controls and gaps. Security
  properties do not automatically carry forward from an earlier stage.

## Cleanup and final explanation

Teardown is another desired-state change. The script removes the Stage 7
release and its generated resources; the final namespace query is evidence of
what remains. Before you run it, preserve any observations you want to explain.

```bash
bash stages/stage7/scripts/teardown.sh --mode helm --env dev --purge
kubectl get namespace apollo-airlines-apps apollo-airlines-ui apollo-observability
```

The namespace query should return `NotFound`. Before calling the capstone
complete, explain:

1. Which controller recreated each deleted Pod?
2. Which resource kept database bytes across Pod replacement?
3. How did Service readiness, cache state, and HPA metrics affect different
   runtime decisions?
4. Which Stage 7 security claims were proven, and which were absent?
5. Why is the platform production-shaped but not production-ready?

Keep the [command reference](./command-reference),
[troubleshooting guide](./troubleshooting), and [glossary](./glossary) nearby.
