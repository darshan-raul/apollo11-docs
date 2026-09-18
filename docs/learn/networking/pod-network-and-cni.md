---
title: "Pod networks and CNI"
description: "Understand how Kubernetes assigns each Pod its own network identity, what a CNI plugin actually does, and why Pod-to-Pod routing is not the same as Service routing."
---

# Pod networks and CNI

*Stage 2 · Guidance*

Booking needs to call flight even when the two Pods run on different nodes. For
that call to work, each Pod needs a network identity and the nodes need a way to
carry packets between them.

Kubernetes describes the required Pod-network behavior, but it does not provide
one universal network implementation. A **Container Network Interface (CNI)
plugin** connects each new Pod to the cluster network. The plugin used by the
local Apollo cluster is called kindnet.

## Linux network namespaces: one IP per Pod

Start with the boundary the application can observe. Containers in one Pod
share a network environment: the same Pod IP, interfaces, and `localhost`.
Containers in another Pod have a different network environment, even when both
Pods happen to run on the same node.

- **Shared Pod network namespace**:
  - All containers inside the same Pod share a single network namespace (`eth0` interface, IP address, and loopback).
  - Containers within the same Pod communicate over `localhost` (e.g. an application talking to a sidecar proxy on `localhost:8082`).
- **Cross-Pod isolation**:
  - Pods on the same node receive distinct IP addresses in their own network namespaces.
  - The cluster network provides a route between Pod IPs; callers do not need a
    host port for ordinary Pod-to-Pod traffic.

~~~mermaid
flowchart TB
  subgraph Node1["Worker Node: apollo11-worker"]
    subgraph BookingPod["Pod: booking-xxx\nNetwork namespace: eth0 = 10.244.1.5"]
      C1["booking container"] 
      C2["sidecar (if present)"]
      C1 <-->|localhost:8082| C2
    end
    subgraph FlightPod["Pod: flight-yyy\nNetwork namespace: eth0 = 10.244.1.6"]
      C3["flight container"]
    end
  end
  subgraph Node2["Worker Node: apollo11-worker2"]
    subgraph SearchPod["Pod: search-zzz\nNetwork namespace: eth0 = 10.244.2.4"]
      C4["search container"]
    end
  end
  BookingPod -->|10.244.1.6:8081 (Pod IP)| FlightPod
  BookingPod -->|10.244.2.4:8083 (Pod IP)| SearchPod
~~~

*Diagram NW-00 — each Pod has its own IP; containers within a Pod share that IP and communicate over localhost; cross-node traffic is routed directly by the CNI.*

---

## How the Pod becomes reachable

When the container runtime prepares a Pod, it invokes the configured CNI plugin.
The plugin performs three kinds of work:

- **Choose an address:** allocate a Pod IP from the range available to the
  cluster. The address-management part is often called IPAM.
- **Connect the Pod:** create a virtual network interface for the Pod and attach
  it to the node's networking environment.
- **Make a route possible:** configure the node so packets can reach Pod
  addresses on this node and, when necessary, other nodes.

The exact Linux devices and routing mechanism vary by plugin. Terms such as
`veth`, VXLAN, Geneve, and eBPF describe implementation choices; you do not need
them to trace Apollo's first request.

### The implementation matters later

Apollo's local lab uses **kindnet** for basic Pod connectivity. It does not
enforce Kubernetes NetworkPolicy objects. Other plugins, including Calico and
Cilium, can add policy enforcement. The security mission returns to that choice;
for now, the important result is that booking can address a flight Pod.

---

## What the CNI does not solve

A working CNI provides raw packet routing, but does not provide:
- **Durable endpoints**: Pod IPs are temporary and can change when Pods are
  replaced.
- **External access**: Pod CIDR IPs are private to the cluster and unreachable from your laptop or the internet.
- **Policy enforcement**: Declaring a Kubernetes `NetworkPolicy` object does nothing if the running CNI lacks an enforcement engine.

---

## Evidence and limits

- **1. Pod IP assignment**: Inspect assigned Pod IPs and hosting nodes:
  ```bash
  kubectl get pods -n apollo-airlines-apps -o wide
  ```
- **2. Direct Pod-to-Pod request**: Derive the current Pod IP, then bypass the
  Service to isolate raw CNI routing. The address is intentionally not hard-coded
  because replacement Pods receive new identities and may receive new IPs:
  ```bash
  BOOKING_POD_IP=$(kubectl get pod -n apollo-airlines-apps -l app=booking \
    -o jsonpath='{.items[0].status.podIP}')
  kubectl exec -n apollo-airlines-ui curl-client -- \
    curl -s "http://${BOOKING_POD_IP}:8082/healthz"
  ```
- **3. Active CNI DaemonSet**: Identify which CNI agent is running on cluster nodes:
  ```bash
  kubectl get pods -n kube-system -l "k8s-app in (kindnet,calico-node,cilium)"
  ```
