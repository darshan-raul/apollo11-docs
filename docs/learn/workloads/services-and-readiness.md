---
title: "Services and readiness"
description: "Trace the path from a stable Service name through selector matching, readiness, and EndpointSlice publication to a packet reaching a booking Pod."
---

# Services and readiness

*Stage 1 · Liftoff*

Every time a booking Pod restarts or updates, it receives a new, ephemeral IP address. If downstream microservices (such as search or frontend) connected directly to Pod IPs, every deployment would trigger a widespread network outage.

A **Service** provides a stable DNS name and virtual IP that decouples callers from dynamic backend Pod lifecycles.

---

## What a Service stores vs. how packets travel

A Service object defines configuration, not a physical network proxy:

- **1. Label selector**: Identifies candidate backend Pods (`app: booking`).
- **2. Port definitions**: Maps the front-facing port (`8082`) to the target container port.
- **3. ClusterIP**: A stable virtual IP allocated from the cluster's internal service CIDR.

The Service itself does not route packets. Routing rules are programmed into the Linux kernel (via iptables or IPVS) by node agents:

~~~mermaid
flowchart LR
  subgraph ControlPath["Control path (configuration)"]
    SVC["Service selector: app=booking"] --> ESC["EndpointSlice controller"]
    Pods["Pods with app=booking\nand Ready=True"] --> ESC
    ESC --> EPS["EndpointSlice\n[10.244.1.5:8082, 10.244.2.8:8082]"]
    EPS --> KP["kube-proxy programs iptables rules"]
  end
  subgraph TrafficPath["Traffic path (packets)"]
    Client["search Pod\ncall: http://booking:8082"] --> VIP["ClusterIP: 10.96.120.40:8082"]
    VIP --> Rule["iptables rule selects endpoint"]
    Rule --> Pod1["booking-xxx:8082"]
    Rule --> Pod2["booking-yyy:8082"]
  end
~~~

*Diagram WL-07 — the control path (selector → endpoint → routing rules) and the traffic path (packet → virtual IP → selected Pod) are maintained by separate actors.*

---

## Readiness: a traffic gate, not a process restart

A **readiness probe** controls whether a Pod should receive traffic right now:

- **Readiness vs. Liveness**:
  - **Liveness failure**: Kills and restarts the container process.
  - **Readiness failure**: Removes the Pod IP from the active `EndpointSlice`. The container stays running without receiving new requests.
- **Why readiness is critical**:
  - Allows slow-starting containers to finish booting and establish database connections before taking requests.
  - Temporarily isolates overloaded or degraded instances so they can drain existing queues without taking new load.
  - Prevents broken rollouts from routing traffic to crashing instances.

---

## Two silent failure modes in Service routing

Service discovery relies on two assumptions that can fail silently:

- **1. Label selector mismatches**:
  - A typo in `spec.selector` (`app: boking`) creates an empty `EndpointSlice`.
  - The Service object exists and DNS resolves the ClusterIP normally, but calls hang or drop because there are no available endpoints.
- **2. Asynchronous propagation delay**:
  - "Pod ready" in Kubernetes does not update every node's iptables rules instantaneously.
  - During rapid deployments, connections may briefly route to terminating or non-existent Pod IPs before `kube-proxy` flushes rules.

---

## Service types comparison

| Service type | Scope & Reachability | Use case |
|---|---|---|
| **`ClusterIP`** (default) | Internal to cluster only | Microservice-to-microservice calls (e.g. `booking` to `flight`) |
| **`NodePort`** | Reachable on high ports (`30000–32767`) on node IPs | Development access, kind port mapping |
| **`LoadBalancer`** | External IP provisioned by cloud or MetalLB | Production ingress, edge gateways |

---

## Evidence and limits

Verify healthy Service endpoints across the complete pipeline:

- **1. Selector match**: Ensure Pods are found and associated:
  ```bash
  kubectl get endpoints booking -n apollo-airlines
  ```
- **2. Pod readiness**: Verify Pods are reporting ready containers (`1/1`):
  ```bash
  kubectl get pods -n apollo-airlines -l app=booking
  ```
- **3. EndpointSlice sync**: Confirm the EndpointSlice object is updated:
  ```bash
  kubectl get endpointslices -n apollo-airlines -l kubernetes.io/service-name=booking
  ```
- **4. Network connectivity**: Test the live ClusterIP from another Pod:
  ```bash
  kubectl exec -n apollo-airlines deploy/frontend -- curl -s http://booking:8082/readyz
  ```
