---
title: Stage 4 — Flight Control
description: Add probes, resource governance, scheduling, graceful shutdown, and disruption budgets.
---

# Stage 4 — Flight Control

Reliability is a set of contracts: startup, readiness, liveness, resource usage, scheduling, termination, and voluntary disruption.

## Build

```bash
cd Apollo11
bash stages/stage4/scripts/apply.sh
kubectl get pods -n apollo-airlines-apps -o wide
kubectl get pdb,priorityclass -A
```

## Concepts: health contracts and scheduling

- `startupProbe` protects slow boot; liveness should not kill a process that is still initializing.
- `readinessProbe` removes a Pod from Service endpoints without restarting it.
- `livenessProbe` restarts a running-but-stuck container.
- `requests` are scheduling guarantees; `limits` are ceilings. Equal CPU and memory requests/limits produce Guaranteed QoS for eligible Pods.
- `priorityClassName` influences preemption and queue ordering; it is not a health check.
- `topologySpreadConstraints` express distribution across node hostnames.
- `preStop` plus a termination grace period gives the process time to drain before SIGKILL.
- A `PodDisruptionBudget` limits voluntary eviction; it does not stop crashes or arbitrary deletion.

Requests are what the scheduler reserves; limits are ceilings enforced by the runtime. QoS is derived from these settings and influences eviction priority. A taint repels Pods, a toleration permits them, node affinity chooses or prefers nodes, and topology spread distributes replicas across domains. A toleration alone does not place a Pod anywhere.

### Probe decision tree

Imagine a process that takes 45 seconds to initialize, then occasionally deadlocks after an hour. A startup probe should allow the first 45 seconds. A readiness probe should fail while dependencies are unavailable so traffic drains away. A liveness probe should eventually fail when the process is stuck so the kubelet restarts it. If you use only liveness during startup, Kubernetes may repeatedly kill a healthy-but-slow process. If you use only readiness, a deadlocked process may remain alive but never recover.

```yaml
startupProbe:
  httpGet: { path: /healthz, port: http }
  periodSeconds: 5
  failureThreshold: 24   # Up to roughly 120 seconds to start
readinessProbe:
  httpGet: { path: /readyz, port: http }
  periodSeconds: 5
  failureThreshold: 2
livenessProbe:
  httpGet: { path: /healthz, port: http }
  periodSeconds: 10
  failureThreshold: 3
```

While a startup probe is failing, Kubernetes does not run the liveness/readiness decision in the normal way. `periodSeconds × failureThreshold` is an approximate upper bound, not a promise about exact wall-clock timing. Probe success means the probe reached the configured endpoint and got an acceptable response; it does not automatically validate every downstream dependency.

### Requests, limits, and QoS

The scheduler uses CPU and memory requests to decide whether a node has room. CPU is compressible: a container may be throttled. Memory is not compressible: exceeding the limit can cause an OOM kill. A request of `200m` CPU means 0.2 CPU cores, not 200 cores. `256Mi` is a binary-mebibyte quantity, not exactly 256 decimal megabytes.

Guaranteed QoS generally requires every container to have CPU and memory requests equal to limits. Burstable Pods have requests but not the full Guaranteed contract. BestEffort Pods have neither. QoS influences eviction ordering when a node is under pressure; it does not make the application correct or fast.

### Graceful termination timeline

When a Pod is terminated, Kubernetes marks it terminating and begins removing it from traffic. It runs `preStop` if configured, sends SIGTERM, waits for the termination grace period, then sends SIGKILL if the process remains. Endpoint propagation is not instantaneous, so the application must tolerate a short overlap. A useful shutdown handler stops accepting new work, finishes bounded in-flight work, closes listeners, and exits before the grace period expires.

### Scheduling policy is a set of constraints

```yaml
tolerations:
  - key: workload
    operator: Equal
    value: search
    effect: NoSchedule
affinity:
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 50
        preference:
          matchExpressions:
            - key: workload
              operator: In
              values: [search]
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels: { app: search }
```

The toleration says “this Pod may use the tainted node.” The preferred affinity says “score that node higher if possible.” The spread constraint says “try to keep matching replicas balanced by hostname.” If the node lacks capacity, the Pod may go elsewhere; if the constraint is hard (`DoNotSchedule`), it may remain Pending instead.

### What a PDB actually protects

A PDB is consulted by the eviction API during voluntary disruption. With two healthy replicas and `minAvailable: 1`, one eviction is allowed and the next is blocked until a replacement is healthy. A direct `kubectl delete pod`, a kernel crash, an OOM kill, a node outage, and a bad liveness probe are not made safe by a PDB. PDBs protect an availability budget during cooperative operations; they are not replicas and not a failover mechanism.

## Inspect

```bash
kubectl describe pod -n apollo-airlines-apps -l app=booking
kubectl get pod -n apollo-airlines-apps -l app=booking -o jsonpath='{range .items[*]}{.metadata.name}{" qos="}{.status.qosClass}{" node="}{.spec.nodeName}{"\n"}{end}'
kubectl get pdb -n apollo-airlines-apps
kubectl get pods -n apollo-airlines-apps -l app=booking -o wide
```

## Break and recover

Delete a Pod and watch its replacement. Then send a termination signal through a rollout and inspect the application log for graceful shutdown. Finally evict one Booking Pod, then immediately attempt a second eviction while `minAvailable` would be violated:

```bash
kubectl delete pod -n apollo-airlines-apps -l app=booking --wait=false
kubectl rollout status deployment/booking -n apollo-airlines-apps --timeout=120s
kubectl get pdb booking-pdb -n apollo-airlines-apps
kubectl drain "$(kubectl get pod -n apollo-airlines-apps -l app=booking -o jsonpath='{.items[0].spec.nodeName}')" --ignore-daemonsets --delete-emptydir-data --pod-selector=app=booking --dry-run=server
```

Use the source README's exact eviction commands for the live disruption experiment, then verify `currentHealthy` and allowed disruptions return after the replacement is ready. Do not confuse voluntary eviction with a hard delete.

### Reliability debugging table

| Symptom | Inspect | Interpretation |
| --- | --- | --- |
| Pod never receives traffic | readiness probe + EndpointSlice | Process may be alive but deliberately withdrawn |
| Container restarts repeatedly | last state, exit code, liveness events | Crash, OOM, or liveness policy |
| Pod Pending | scheduler events, requests, affinity | No node satisfies resource/placement constraints |
| Second eviction rejected | PDB status | Availability budget is currently exhausted |
| Requests dropped during rollout | termination logs, endpoint changes, grace period | Drain/shutdown contract is too weak or too short |
| Replicas on one node | `kubectl get pods -o wide`, spread config | Distribution is preference, impossible, or mis-selected |

## Read a reliability manifest as a set of contracts

Do not read the probe, resources, PDB, and scheduling fields as unrelated knobs. They interact:

```yaml
spec:
  replicas: 2
  minReadySeconds: 10
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: booking
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits: { cpu: 200m, memory: 256Mi }
          readinessProbe:
            httpGet: { path: /readyz, port: http }
          livenessProbe:
            httpGet: { path: /healthz, port: http }
          lifecycle:
            preStop:
              exec:
                command: [sh, -c, 'sleep 5']
```

The readiness probe determines whether the Pod is an endpoint. `minReadySeconds` asks the Deployment to observe readiness for a period before counting the replica as available. The termination grace period bounds the shutdown window. The `preStop` delay can allow EndpointSlice propagation, but it also consumes the same grace period; it is not a substitute for application-level SIGTERM handling. Equal requests and limits make the resource contract predictable, but they also make a Pod harder to schedule on a small node.

## Reliability experiment design

Every failure experiment should define the hypothesis, the safe scope, the signal, and the recovery action. For example: “If I evict one of two healthy Booking Pods, the PDB permits one eviction, a replacement appears, the endpoint stays available, and a second immediate eviction is rejected.” That statement is better than “test PDB,” because it says what evidence would falsify the model.

Avoid testing with several simultaneous failures. If you delete a Pod, taint a node, and change a probe at once, you cannot tell which control loop caused the result. Restore the cluster after every experiment and check for Pending Pods, stale PDB status, and leftover node labels/taints.

## Stage 4 checkpoint questions

1. Which probe should fail when a database is down, and which should not?
2. Why can a Pod be healthy but absent from a Service?
3. How do requests affect both scheduling and HPA utilization?
4. What does Guaranteed QoS change during node pressure?
5. Why does a toleration not guarantee placement on a tainted node?
6. Which failures can a PDB protect against, and which can it not?
7. What should a process do after SIGTERM but before SIGKILL?

## Gotchas

- A readiness failure does not restart a container; a liveness failure does.
- Requests are not limits and limits are not automatically capacity.
- PDBs do not protect against node loss, OOM kills, or `kubectl delete`.
- Spread constraints can make a Pod Pending if topology domains or capacity do not satisfy them.
- `preStop` consumes termination grace time; too-short grace periods still cut traffic.

```bash
bash stages/stage4/scripts/verify.sh
bash stages/stage4/scripts/teardown.sh
```

Continue to [Stage 5](./stage-5).
