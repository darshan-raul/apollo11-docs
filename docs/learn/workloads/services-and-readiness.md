---
title: "Services and readiness, briefly"
description: "Just enough about Services to run Stage 1: a stable name in front of replaceable Pods, and readiness deciding which Pods get traffic. Stage 2 covers how it works."
---

# Services and readiness, briefly

*Stage 1 · Liftoff*

**You will be able to:** explain why callers use a Service name instead of a Pod IP, read the Service next to each Apollo Deployment, and say what readiness changes for traffic.

This stage is about workloads: Deployments keep Pods running and replace them when they fail. Replacement has a side effect. Each new Pod gets a new name **and a new IP** ([ReplicaSets](../cluster/replicasets)). If `booking` called flight at a Pod IP, every replacement would break it. Stage 1 needs just enough of a Service to fix that. How a Service actually works is the subject of [Stage 2](../networking/service-control-and-data-paths).

## A Service in one paragraph

A **Service** gives a group of Pods one stable name and one stable virtual IP (its **ClusterIP**). It picks its Pods by **label selector**, not by name, so replacements are included automatically. It sends traffic only to Pods that report **ready**. Callers use the name; Pods come and go behind it.

Each Apollo app has a Deployment and a Service that share one label. Trimmed from [Stage 1's booking manifests](https://github.com/darshan-raul/Apollo11/tree/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage1/k8s/apps/booking):

```yaml
# Deployment: the Pod template carries the label
template:
  metadata:
    labels: {app: booking}
---
# Service: selects Pods by that label
kind: Service
metadata: {name: booking}
spec:
  selector: {app: booking}
  ports:
    - port: 8082        # callers use booking:8082
      targetPort: 8082  # the container listens here
```

That is why booking's ConfigMap can say `FLIGHT_SERVICE_URL=http://flight:8081`, exactly as in Compose, and keep working while flight's Pods are replaced.

## Readiness decides who gets traffic

A Pod that is `Running` is not necessarily able to serve. Booking might still be connecting to its database. A **readiness probe** is a check the kubelet runs repeatedly to ask "can this container take requests now?":

```yaml
readinessProbe:
  httpGet: {path: /readyz, port: 8082}   # booking's /readyz checks its database
  periodSeconds: 5
```

| Readiness result | What happens to the Pod | What happens to traffic |
|---|---|---|
| Passing | Nothing | The Service sends it requests |
| Failing | Keeps running; **not restarted** | The Service stops sending it new requests |

Readiness also matters to the workload itself: a Deployment rollout only counts a new Pod as available once it is ready, so a broken version stalls instead of replacing every healthy Pod ([Rollouts and rollback](./rollouts-and-rollback)). Restarting on failure is a different probe, liveness. [Stage 4](../reliability/probes) covers all the probes in depth.

## The one failure to know now

Kubernetes does not check that the Deployment's labels and the Service's selector agree. A typo (`app: boking`) is accepted without an error or event. The Pods run, the name resolves, and every call fails. The first check is always whether the Service found any Pods:

```bash
kubectl get endpointslice -n apollo-airlines -l kubernetes.io/service-name=booking
```

An empty list means the selector matches no ready Pod. Stage 2 explains what that object is.

## Try it

:::caution[Unverified]
Not yet run on a live cluster for this documentation revision. Needs Stage 1 applied.
:::

```bash
kubectl get svc booking -n apollo-airlines                      # one ClusterIP
kubectl get pods -n apollo-airlines -l app=booking -o wide      # two Pod IPs
kubectl delete pod -n apollo-airlines -l app=booking --wait=false
kubectl get pods -n apollo-airlines -l app=booking -o wide -w   # new names, new IPs; Ctrl-C
kubectl get svc booking -n apollo-airlines                      # same ClusterIP
```

- The Pods are replaced with new IPs; the Service's address does not change. Callers using `booking:8082` never notice.

## Common misconceptions

- **"A failing readiness probe restarts the container."** It only withholds traffic. Restarting is liveness.
- **"If the name resolves, the Service works."** The name exists as long as the Service object does, even with zero Pods behind it.

## Check yourself

<details>
<summary>A booking Pod is replaced. Does search need a config change to keep calling it?</summary>

No. search calls the Service name, and the Service selects the new Pod by label.
</details>

<details>
<summary>booking's database is down. Why is restarting booking's Pods not the right reaction?</summary>

A restart does not bring the database back. Failing readiness keeps traffic away from booking until the dependency returns, without churning the Pods.
</details>

## Where this leads

Stage 2 opens the Service up: [Pod networks](../networking/pod-network-and-cni), [how a Service moves packets](../networking/service-control-and-data-paths), [EndpointSlices](../networking/endpoints-and-endpointslices), [cluster DNS](../networking/dns-and-namespaces) and [getting traffic in from outside](../networking/nodeport-and-loadbalancer). In Stage 1, the next need is configuration: [how settings and identity reach a Pod](./configuration-and-identity).
