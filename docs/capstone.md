---
title: "Apollo11 Core Capstone"
description: "Deploy, inspect, stress, recover, and audit the verified Stage 7 Apollo Airlines platform."
sidebar_label: "Core Capstone"
---

# Apollo11 Core Capstone: Operate What Exists

:::info[Page type · optional assessed lab]
Use the pinned Apollo11 revision. The capstone assesses whether you can explain
why things happen, not whether you can run the commands. Security and cloud
controls that are not implemented must stay labelled as conceptual.
:::

If you would like to follow the story before running the lab, start with
[A Passenger’s Booking](./learn/capstone/a-booking-through-kubernetes), then come
back here when you are ready to take the controls.

This capstone is not just a longer checklist. It is one guided story in which you
act as the operator. You will establish what the Stage 7 system claims to do,
follow a passenger's booking, replace stateful and stateless pieces, see how the
cache and autoscaling drive different decisions, and finish by naming what this
local lab cannot prove.

It covers the verified local path from Ignition through Stage 7. It does not need
the security or cloud stages, which are not implemented. Your final task is not to
declare the platform "production-ready". It is to explain which Kubernetes object
or controller caused each outcome you saw, and to name the gaps that remain.

All commands come from `stages/ignition/`, `stages/stage3/`, and `stages/stage7/`.
Run them from the root of the Apollo11 repository.

## Mission 1: set up the system you will investigate

Before you test a failure, establish the baseline. The apply script only creates
the desired state. It does not show that the controllers, endpoints, and telemetry
have settled. Treat the verification script as a broad check, then keep the live
status as the baseline to compare against in later missions.

- **Objective**: Create the expected three-node kind cluster and deploy Stage 7
  in its dev configuration, which is sized for a workstation.
- **Starting point**: Docker is running, and `kind`, `kubectl`, Helm, and the other
  prerequisites from the repository are installed. Delete any existing `apollo11`
  cluster first, or reuse it on purpose.
- **Instructions**:

```bash
cd Apollo11

kind get clusters | grep -qx apollo11 || \
  kind create cluster --config stages/ignition/kind-config.yaml
kubectl config use-context kind-apollo11

bash stages/stage7/scripts/apply.sh --mode helm --env dev
```

- **Expected result**: The application, UI, access stack, and observability
  resources all become ready. Dev starts with one replica of each application, an
  HPA range of 1–3 for `search`, no VPA, and no PDBs.
- **Verification**:

```bash
bash stages/stage7/scripts/verify.sh --mode helm --env dev
```

  The repository records **211/211** checks for this mode. If that number changes,
  trust the total that the script prints.
- **Troubleshooting**: Start with `kubectl get pods -A`, then check, in this order,
  the events, `describe` output, logs, and endpoints. See the
  [troubleshooting guide](./troubleshooting).
- **Concept reinforced**: A successful apply is where verification starts, not a
  substitute for it.

## Mission 2: follow one passenger workflow through the system

The next command creates a booking and then cancels it. It makes two different
claims, so predict the difference before you run it. The HTTP transaction proves
the application behaves correctly. The Tempo check proves that the same request
context travelled across the service boundaries.

- **Objective**: Run a booking and its cancellation, and show that a single trace
  covers `booking`, `identity`, `flight`, and `notification`.
- **Starting point**: Mission 1 passes, including the observability stack.
- **Instructions**:

```bash
bash stages/stage7/scripts/trace-test.sh
```

- **Expected result**: The script prints progress for the in-cluster client, the
  login, the booking, the Tempo lookup, and the cancellation. Its last line
  confirms that the seat was restored and that all four service names appear in one
  trace. The script deliberately removes its client Pod and cancels the booking,
  so no active reservation is left afterwards.
- **Verification**: Keep the `trace_id=... services=...` line. If you like, forward
  Grafana's port and find the same trace there:

```bash
kubectl port-forward -n apollo-observability svc/grafana 3000:3000
```

  The chart allows anonymous Viewer access for this local lab.
- **Troubleshooting**: Read the error from the temporary client, then the logs of
  the four services, the OpenTelemetry Collector, and Tempo. A trace can show up a
  little after the HTTP response, because traces are exported asynchronously.
- **Concept reinforced**: Logs describe one process. A trace carries the cause and
  effect across service boundaries.

## Mission 3: replace a database Pod and keep its claim

Stage 1 showed that a controller can replace a missing Pod. Stage 3 showed that a
StatefulSet reattaches its numbered Pod to the same PVC. In this mission you
collect both pieces of evidence together: a new Pod, and the same named claim.

This is a short version of the Stage 3 persistence exercise, using the booking
schema in `stages/stage7/helm/apollo11/values.yaml`. The UUIDs and the booking
reference below are made up for this lab. They are not seed data from the
repository.

- **Objective**: Show that a row in the Stage 7 PostgreSQL database survives the
  replacement of its Pod, then delete the lab row.
- **Starting point**: `booking-db-0` is Ready.
- **Instructions**:

```bash
# Insert a unique lab row and read it back.
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

# Replace only the Pod. Do not delete its PVC.
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

- **Expected result**: The row is there both before and after the Pod is
  replaced, and the cleanup deletes one row.
- **Verification**:

```bash
kubectl get pvc pg-data-booking-db-0 -n apollo-airlines-apps
```

  The claim stays `Bound` while the Pod is replaced.
- **Troubleshooting**: If PostgreSQL says the relation does not exist, check the
  StatefulSet, the mounted PVC, and the database logs before you run any
  initialization again. Do not delete the PVC as a shortcut to recovery.
- **Concept reinforced**: This shows persistence across Pod replacement, on kind's
  node-local storage. It does not show recovery from node loss, backups,
  replication, or high availability.

## Mission 4: tell a cache decision from a scaling decision

The first two requests show whether the application answered from Redis or from
`flight`. The scheduling lab shows controllers reacting to measured CPU and to
node rules. Both happen in the same platform, but they are different mechanisms,
so read their evidence separately.

- **Objective**: Show the cache going from MISS to HIT, then run the repository's
  reversible HPA and scheduling lab.
- **Starting point**: Stage 7 is healthy, and `kubectl top nodes` returns data from
  metrics-server.
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
  script temporarily lowers the HPA threshold and generates real HTTP load. It
  shows `search` scaling out above the dev minimum, with Pods on at least two
  workers, then scaling back to the minimum and undoing its own changes.
- **Verification**:

```bash
kubectl get hpa search-hpa -n apollo-airlines-apps
kubectl get nodes --show-labels | grep 'apollo11.io/search-pool' || \
  echo "temporary search-pool label removed"
```

- **Troubleshooting**: If the load does not cause a scale-out, check `kubectl top
  pods`, the HPA conditions, and `FailedGetResourceMetric` events. If the lab is
  interrupted, run `bash stages/stage7/scripts/scaling-lab.sh cleanup`.
- **Concept reinforced**: Caching reduces the work done per request. The HPA changes
  the replica count based on measured load. Scheduling rules decide where Pods
  are placed. Each solves a different problem.

## Mission 5: watch a rollout without overclaiming availability

In dev, `booking` starts with one replica and no PDB. For this experiment you
scale it to two. Remember that a PDB only limits voluntary evictions. It does not
govern availability during a Deployment's rolling update.

This is an observation, not a proof of "zero downtime". The request sampler gives
you a limited result from one local run. If a request fails, its timestamp is only
useful when you compare it with evidence from the Deployment, the endpoints, the
Gateway, and the application.

- **Objective**: Watch a rolling restart of a Deployment under a fixed amount of
  traffic, and record whether this local run returns any readiness responses
  other than 200.
- **Starting point**: `GATEWAY_IP` is still set from Mission 4.
- **Instructions**:

In terminal 2, first scale booking to two replicas and wait until it is ready:

```bash
kubectl scale deployment/booking -n apollo-airlines-apps --replicas=2
kubectl rollout status deployment/booking -n apollo-airlines-apps --timeout=120s
```

In terminal 1, start the request sampler, which prints timestamps:

```bash
failures=0
total=0
for request in $(seq 1 300); do
  ts=$(date +%H:%M:%S.%3N)
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 1 \
    -H 'Host: booking.apollo.local' \
    "http://${GATEWAY_IP}/healthz/ready" || true)
  total=$((total + 1))
  if [ "$status" != 200 ]; then
    failures=$((failures + 1))
    printf '[%s] request=%s status=%s\n' "$ts" "$request" "${status:-curl-error}"
  fi
  sleep 0.1
done
printf 'Finished %s requests: non_200=%s\n' "$total" "$failures"
```

In terminal 2, while the sampler is running:

```bash
# Trigger the rolling restart
kubectl rollout restart deployment/booking -n apollo-airlines-apps
kubectl rollout status deployment/booking -n apollo-airlines-apps --timeout=120s
kubectl get pods -n apollo-airlines-apps -l app=booking -o wide

# Restore the dev baseline once you have finished observing.
kubectl scale deployment/booking -n apollo-airlines-apps --replicas=1
```

- **Expected result**: The Deployment replaces its Pods one at a time and becomes
  Available again. Ideally this run shows zero failures, but that is only what you
  observed locally. It is not a guarantee.
- **Verification**: Keep the `non_200` count, the timestamps, and the rollout
  output as your evidence.
- **Troubleshooting**: For any failure, match its timestamp against Pod readiness,
  events, the Envoy logs, and the booking logs.
- **Concept reinforced**: Readiness probes and the rolling update strategy protect
  traffic during an update. The dev environment has no PDB, and the Stage 7 chart
  does not define the Stage 4 `preStop` hook, so neither of them can be credited
  for this result.

## Mission 6: tell controls that are demonstrated from controls that are only planned

An audit is part of operating a real system. A setting from an earlier stage is
not automatically still in place later. Inspect the Stage 7 rendered workload,
state exactly what it proves, and record the planned Stage 8 controls as gaps
instead of assuming they exist.

- **Objective**: Check what Stage 7 really configures, and write down what is
  still missing until Stage 8.
- **Starting point**: The cluster is healthy after Mission 5.
- **Instructions and verification**:

```bash
# The Stage 7 verification script checks for equal CPU and memory requests and
# limits on the ten application and data workloads. Look at their live QoS classes.
kubectl get pods -n apollo-airlines-apps -l 'tier in (public,data)' \
  -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass'
kubectl get pods -n apollo-airlines-ui \
  -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass'

# Dev deliberately has no application PDBs.
kubectl get pdb -A

# Check the ServiceAccount: confirm that automountServiceAccountToken: false is set
kubectl get serviceaccount booking -n apollo-airlines-apps -o yaml | grep automountServiceAccountToken
# Output: automountServiceAccountToken: false (shown in Stage 7)

# Check the Pod template for the hardening fields planned for Stage 8
kubectl get deployment booking -n apollo-airlines-apps -o yaml | \
  grep -E 'runAsNonRoot|readOnlyRootFilesystem|seccompProfile' || \
  echo 'planned Stage 8 container hardening fields are not present on this Deployment'
```

- **Expected result**: The ten workloads in the chart have equal requests and
  limits (Guaranteed QoS), and their ServiceAccounts disable token automount
  (`automountServiceAccountToken: false`). The Stage 7 snapshot does not implement
  the security controls planned for Stage 8: Pod Security Admission (PSA),
  read-only root filesystems, Calico NetworkPolicy enforcement, the External
  Secrets Operator (Vault/ESO), or Kyverno admission policies.
- **Troubleshooting**: Avoid sweeping statements such as "all Pods are Guaranteed".
  Add-on Pods and temporary Pods can have a different QoS class. Always say which
  selector and which set of workloads you checked.
- **Concept reinforced**: An audit reports both the controls that are demonstrated
  and the gaps that remain. Security properties do not carry forward automatically
  from an earlier stage.

## Cleanup and final explanation

Teardown is also a change to the desired state. The script removes the Stage 7
release and the resources it generated, and the namespace query at the end shows
what is left. Before you run it, save any observations you want to explain.

```bash
bash stages/stage7/scripts/teardown.sh --mode helm --env dev --purge
kubectl get namespace apollo-airlines-apps apollo-airlines-ui apollo-observability
```

The namespace query should return `NotFound`. Before you call the capstone
complete, explain:

1. Which controller recreated each Pod you deleted?
2. Which resource kept the database's data when its Pod was replaced?
3. How did Service readiness, the cache state, and the HPA metrics each affect a
   different runtime decision?
4. Which Stage 7 security claims did you demonstrate, and which controls were
   missing?
5. Why is the platform production-shaped but not production-ready?

Keep the [command reference](./command-reference),
[troubleshooting guide](./troubleshooting), and [glossary](./glossary) nearby.
