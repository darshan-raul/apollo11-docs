---
title: "Pod networks and CNI"
description: "Understand how Kubernetes assigns each Pod its own network identity, what a CNI plugin actually does, and why Pod-to-Pod routing is not the same as Service routing."
---

# Pod networks and CNI

*Stage 2 · Guidance*

In Kubernetes, every Pod receives its own distinct, routable IP address. Containers in different Pods across different nodes communicate directly without NAT (Network Address Translation). 

Kubernetes defines this networking model as a specification, but relies on a **Container Network Interface (CNI)** plugin to implement it.

---

## Linux network namespaces: one IP per Pod

Container isolation is enforced at the Linux kernel level via namespaces:

- **Shared Pod network namespace**:
  - All containers inside the same Pod share a single network namespace (`eth0` interface, IP address, and loopback).
  - Containers within the same Pod communicate over `localhost` (e.g. an application talking to a sidecar proxy on `localhost:8082`).
- **Cross-Pod isolation**:
  - Pods on the same node receive distinct IP addresses in their own network namespaces.
  - Pods communicate via standard IP routing, not port-forwarding or host mapping.

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

## What a CNI plugin actually does

When a container runtime (such as `containerd`) creates a Pod sandbox, it invokes the CNI plugin to configure the network:

- **1. IP Allocation (IPAM)**: Assigns an IP address to the Pod from the cluster's Pod CIDR (`10.244.0.0/16`).
- **2. Interface Plumbing**: Creates a virtual ethernet pair (`veth`), attaching one end to the host node bridge and the other into the Pod's network namespace as `eth0`.
- **3. Cross-Node Routing**: Programs route tables or overlay tunnels (VXLAN/Geneve) so nodes know how to forward packets destined for Pods on other nodes.

### Kindnet vs. Production CNIs:
- **`kindnet`** (Apollo11 local lab): Minimal CNI for local clusters. Configures basic node-to-node routing tables. **Does not enforce `NetworkPolicy`**.
- **`Calico` / `Cilium`** (Stage 8 production): Full-featured CNIs that program eBPF or iptables rules to enforce network segmentation and security policies.

---

## What the CNI does not solve

A working CNI provides raw packet routing, but does not provide:
- **Durable endpoints**: Pod IPs are ephemeral and change upon every restart.
- **External access**: Pod CIDR IPs are private to the cluster and unreachable from your laptop or the internet.
- **Policy enforcement**: Declaring a Kubernetes `NetworkPolicy` object does nothing if the running CNI lacks an enforcement engine.

---

## Evidence and limits

- **1. Pod IP assignment**: Inspect assigned Pod IPs and hosting nodes:
  ```bash
  kubectl get pods -n apollo-airlines-apps -o wide
  ```
- **2. Direct Pod-to-Pod ping**: Bypass Services to isolate raw CNI routing:
  ```bash
  kubectl exec -n apollo-airlines-ui curl-client -- curl -s http://10.244.1.5:8082/healthz
  ```
- **3. Active CNI DaemonSet**: Identify which CNI agent is running on cluster nodes:
  ```bash
  kubectl get pods -n kube-system -l "k8s-app in (kindnet,calico-node,cilium)"
  ```
