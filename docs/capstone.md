---
title: "The Apollo11 Capstone Challenge"
description: "A comprehensive, multi-phase operational mission testing your end-to-end Kubernetes skills grounded in Apollo Airlines."
sidebar_label: "Capstone Challenge"
---

# The Apollo11 Capstone Challenge: Flight Operations Certification

Congratulations on reaching the capstone! Throughout this curriculum, you built, inspected, broke, recovered, and explained individual Kubernetes concepts stage by stage.

The **Apollo11 Capstone Challenge** puts everything together into a **single, continuous operational mission**. You are the Lead Platform Reliability Engineer for Apollo Airlines on launch day. You will deploy the fleet, verify its health, recover from unexpected outages, absorb traffic spikes, execute a zero-downtime rolling upgrade, and audit cluster security.

---

## 🎯 Capstone Mission Objectives

```mermaid
flowchart LR
  M1["Phase 1: Zero-to-Live Fleet Deployment"] --> M2["Phase 2: The Flagship Booking Verification"]
  M2 --> M3["Phase 3: Database Outage & Recovery Drill"]
  M3 --> M4["Phase 4: Holiday Traffic Surge (HPA & Caching)"]
  M4 --> M5["Phase 5: Zero-Downtime Rolling Upgrade"]
  M5 --> M6["Phase 6: Security & Governance Audit"]
```

1. **Phase 1: Zero-to-Live Fleet Deployment**: Deploy the verified, hardened Stage 7 platform on a clean kind cluster.
2. **Phase 2: Flagship Booking Verification**: Execute an end-to-end flight booking and trace its distributed span waterfall in Grafana Tempo.
3. **Phase 3: Database Outage & Recovery Drill**: Simulate catastrophic database pod deletion and prove persistent data survival without data loss.
4. **Phase 4: Holiday Traffic Surge**: Generate synthetic load on flight search, verify Redis cache hits, and observe HPA scale out from 1 to 3 replicas.
5. **Phase 5: Zero-Downtime Rolling Upgrade**: Perform a live rolling update while running background traffic, verifying zero dropped requests via PDBs and `preStop` hooks.
6. **Phase 6: Security & Governance Audit**: Verify non-root containers, read-only root filesystems, Guaranteed QoS, and tokenless ServiceAccounts.

---

## 🚀 Phase 1: Zero-to-Live Fleet Deployment

### Objective
Start with a clean local cluster and bring all 10 Apollo Airlines workloads, Envoy Gateway, MetalLB, and the observability stack online.

### Instructions

```bash
cd /home/darshan/projects/Apollo11

# 1. Ensure your kind cluster is running with proper port mappings
kind get clusters | grep -q apollo11 || kind create cluster --config stages/ignition/kind-config.yaml
kubectl config use-context kind-apollo11

# 2. Deploy Stage 7 in Helm dev mode
bash stages/stage7/scripts/apply.sh --env dev

# 3. Wait for all pods across apps and observability namespaces to become Ready
kubectl wait --for=condition=Ready pods --all -n apollo-airlines-apps --timeout=180s
kubectl wait --for=condition=Ready pods --all -n apollo-observability --timeout=180s
```

### Verification Command

```bash
# Run the automated verification suite
bash stages/stage7/scripts/verify.sh
```

**Passing Criteria**: All 211 automated checks pass with 0 failures.

---

## 🛫 Phase 2: Flagship Booking Verification

### Objective
Execute the multi-service reservation workflow and inspect its distributed trace.

### Instructions

```bash
# 1. Run the end-to-end trace test script
bash stages/stage6/scripts/trace-test.sh
```

### Expected Output
The script outputs:
```text
==> Authenticating user against identity service...
==> Querying flights from flight service...
==> Creating booking reservation...
==> Booking successfully confirmed! Booking ID: bkg-...
==> Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736
```

### Verification in Grafana Tempo
1. Open Grafana (`http://localhost:3000` via `kubectl port-forward svc/grafana 3000:3000 -n apollo-observability`).
2. Navigate to **Explore** -> select **Tempo**.
3. Search for the printed `Trace ID`.
4. **Passing Criteria**: You observe a single unified trace containing spans from `booking` -> `identity`, `flight`, and `notification`.

---

## 💥 Phase 3: Database Outage & Recovery Drill

### Objective
Prove that relational database state survives abrupt Pod termination.

### Instructions

```bash
# 1. Query the newly created booking from PostgreSQL
kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c "SELECT id, status, total_price FROM bookings ORDER BY created_at DESC LIMIT 1;"

# Record the booking ID!

# 2. Kill the database Pod abruptly
kubectl delete pod booking-db-0 -n apollo-airlines-apps --now

# 3. Wait for StatefulSet self-healing
kubectl wait --for=condition=Ready pod/booking-db-0 -n apollo-airlines-apps --timeout=60s

# 4. Re-query the database for the booking ID
kubectl exec -n apollo-airlines-apps booking-db-0 -- \
  psql -U postgres -d booking -c "SELECT id, status, total_price FROM bookings ORDER BY created_at DESC LIMIT 1;"
```

**Passing Criteria**: The reservation record is 100% intact, proving that the `pg-data-booking-db-0` PersistentVolumeClaim reattached seamlessly.

---

## 📈 Phase 4: Holiday Traffic Surge (Autoscaling & Caching)

### Objective
Trigger horizontal pod autoscaling under load and verify Redis cache acceleration.

### Instructions

```bash
# 1. Test cache-aside headers on search
GATEWAY_IP=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')

# First query: Cache MISS
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=DEL&date=2026-06-25" | grep "X-Cache"
# Expected: X-Cache: MISS

# Second query: Cache HIT
curl -i -H "Host: search.apollo.local" "http://${GATEWAY_IP}/api/search?origin=BOM&destination=DEL&date=2026-06-25" | grep "X-Cache"
# Expected: X-Cache: HIT

# 2. Execute the practical scaling lab
bash stages/stage7/scripts/scaling-lab.sh run
```

**Passing Criteria**:
- `search` service scales from 1 replica up to 3 replicas under load.
- Replicas are distributed across `apollo11-worker` and `apollo11-worker2` according to `topologySpreadConstraints`.
- Replicas cleanly contract back to baseline after traffic ceases.

---

## 🔄 Phase 5: Zero-Downtime Rolling Upgrade

### Objective
Upgrade the `booking` service to a simulated new release without dropping a single user request.

### Instructions

```bash
# 1. In Terminal 1, launch a continuous traffic loop
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: booking.apollo.local" "http://${GATEWAY_IP}/readyz")
  if [ "$STATUS" -ne 200 ]; then
    echo "OUTAGE DETECTED! HTTP Status: $STATUS"
    exit 1
  fi
  sleep 0.2
done

# 2. In Terminal 2, trigger a rolling update with restart
kubectl rollout restart deployment/booking -n apollo-airlines-apps

# 3. Watch rollout status
kubectl rollout status deployment/booking -n apollo-airlines-apps
```

**Passing Criteria**:
The continuous curl loop in Terminal 1 experiences **zero non-200 responses**!
This proves that:
1. `lifecycle.preStop` (`sleep 5`) allowed Envoy Gateway to deregister retiring pods.
2. `srv.Shutdown()` drained in-flight requests cleanly.
3. `readinessProbe` prevented new pods from receiving traffic before they were fully initialized.
4. `booking-pdb` guaranteed at least 1 healthy replica was online at all times.

---

## 🛡️ Phase 6: Security & Governance Audit

### Objective
Verify that the cluster adheres to production security and governance baselines.

### Instructions

```bash
# 1. Verify Guaranteed QoS on all application pods
kubectl get pods -n apollo-airlines-apps -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass'

# 2. Verify all ServiceAccounts have token automount disabled
for sa in $(kubectl get sa -n apollo-airlines-apps -o jsonpath='{.items[*].metadata.name}'); do
  AUTOMOUNT=$(kubectl get sa "$sa" -n apollo-airlines-apps -o jsonpath='{.automountServiceAccountToken}')
  if [ "$AUTOMOUNT" != "false" ]; then
    echo "SECURITY VIOLATION: SA $sa has automount enabled!"
  fi
done
echo "ServiceAccount audit complete: All tokens disabled."

# 3. Verify read-only filesystem enforcement
kubectl exec -n apollo-airlines-apps deploy/booking -- touch /hacked.txt 2>&1 | grep "Read-only file system"
```

**Passing Criteria**:
- Every pod reports `QOS: Guaranteed`.
- All ServiceAccounts report `automountServiceAccountToken: false`.
- Touch attempt on `/hacked.txt` fails with `Read-only file system`.

---

## 🎓 Certification Complete!

If you completed all 6 phases and passed every verification check:
You have earned your **Apollo11 Kubernetes Flight Certification**!

You have demonstrated mastery over:
- Deployments, ReplicaSets, and Pod lifecycle.
- CoreDNS, EndpointSlices, and Envoy Gateway API.
- StatefulSets, PersistentVolumeClaims, and StorageClasses.
- Liveness/Readiness probes, Guaranteed QoS, and graceful SIGTERM drains.
- Helm packaging, multi-environment values, and Kustomize.
- Prometheus metrics, PromQL SLOs, and OpenTelemetry distributed tracing.
- HPA v2 autoscaling, Redis cache-aside, and node scheduling governance.

Refer back to the [Command Reference](./command-reference), [Troubleshooting Guide](./troubleshooting), and [Glossary](./glossary) whenever you deploy Kubernetes in your future missions!
