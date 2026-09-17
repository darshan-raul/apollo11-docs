---
title: "NodePort and LoadBalancer"
description: "Trace the two-hop path from a laptop to a Pod through a kind port mapping and a NodePort Service, and understand why MetalLB is needed before LoadBalancer works locally."
---

# NodePort and LoadBalancer

*Stage 2 · Guidance*

A `ClusterIP` address is strictly private to the Kubernetes virtual network. When developers run `curl http://localhost:30082` from their host laptop, two distinct forwarding mechanisms collaborate to bridge traffic into the cluster.

---

## Two hops across two independent systems

Traffic entering a local kind cluster crosses two separate boundaries:

- **Hop 1: Host-to-Node Port Mapping (Docker Engine)**:
  - Configured via `kind-config.yaml` with `extraPortMappings`.
  - Forwards `localhost:30082` on your laptop into the kind control-plane container on port `30082`.
- **Hop 2: NodePort-to-Pod Routing (Kubernetes `kube-proxy`)**:
  - The NodePort Service opens port `30082` on all cluster nodes.
  - Node iptables rules pick a ready `booking` Pod and translate the destination IP to the Pod IP (`10.244.1.5:8082`).

~~~mermaid
flowchart LR
  Laptop["Laptop: localhost:30082"] -->|Host-port mapping\n(Docker / kind-config.yaml)| KindCP["kind control-plane container\nport 30082"]
  KindCP -->|NodePort Service\n(kube-proxy iptables)| Pod["booking Pod:8082\n(10.244.1.5)"]
~~~

*Diagram NW-05 — the first hop is Docker's port mapping; the second hop is the Kubernetes NodePort Service routing to a Pod.*

---

## Why NodePort is inappropriate for production

While practical for local labs, NodePort presents severe production drawbacks:
- **Port range limitations**: Restricted to high ports (`30000–32767`). Passengers expect standard web ports (`80` and `443`).
- **Cluster-wide surface area**: Allocates the chosen port on *every single node* in the cluster, creating security exposure and firewall complexity.
- **No Layer 7 intelligence**: Forwards raw TCP streams without host-based routing, TLS termination, or path rewrites.

---

## The LoadBalancer Service type and MetalLB

In public clouds, setting `type: LoadBalancer` automatically triggers cloud provider controllers (AWS NLB, GCP Cloud Load Balancing) to provision an external IP.

In bare-metal or local kind environments:
- Without an external controller, `type: LoadBalancer` remains stuck with `EXTERNAL-IP: <pending>`.
- **MetalLB** provides the missing controller implementation locally:
  - **Controller**: Watches for `LoadBalancer` Services and assigns an IP from a preconfigured pool (`172.18.0.50–172.18.0.100`).
  - **Speaker**: Announces the IP to the local Docker network using ARP (Layer 2 mode).

---

## Service exposure comparison

| Type | Access Boundary | Ideal Usage |
|---|---|---|
| **`ClusterIP`** | Internal cluster only | Backend microservices, databases |
| **`NodePort`** | Node IP + High Port | Local dev, manual smoke testing |
| **`LoadBalancer` (MetalLB / Cloud)** | Dedicated external IP | Public edge gateways, HTTP/HTTPS proxies |
| **`Envoy Gateway` / Ingress** | L7 routing behind LoadBalancer | Modern multi-host, path-routed microservice architectures |

---

## Evidence and limits

- **1. Docker host-port mapping**: Confirm kind container has ports exposed:
  ```bash
  docker ps --filter name=apollo11 --format "{{.Ports}}"
  ```
- **2. NodePort definition**: Check assigned node ports:
  ```bash
  kubectl get svc -n apollo-airlines-apps -o wide
  ```
- **3. MetalLB allocation**: Verify external IP is assigned (not `<pending>`):
  ```bash
  kubectl get svc -n envoy-gateway-system
  ```
- **4. Endpoint health**: Ensure the Service has backing Pods ready to receive traffic:
  ```bash
  kubectl get endpoints -n apollo-airlines-apps
  ```
