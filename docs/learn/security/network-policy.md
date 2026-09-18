---
title: "NetworkPolicy"
description: "Understand how NetworkPolicy enforces traffic isolation, why a capable CNI is mandatory for enforcement, and how default-deny patterns secure microservice networks."
---

# NetworkPolicy

*Stage 8 · Command Module (Planned Roadmap)*

:::note[Conceptual chapter]
Apollo's supported local cluster uses kindnet, which does not enforce these
policies. The commands below show how a future policy-capable environment would
be checked; they are not a runnable Stage 8 lab.
:::

By default, Kubernetes networks are **flat and completely open**: any Pod in any namespace can open a TCP connection to any other Pod IP or Service across the cluster. If an attacker compromises the public-facing frontend, they can query internal databases directly.

A **NetworkPolicy** acts as an in-cluster packet filter, restricting network traffic between Pods based on label selectors, ports, and namespaces.

---

## CNI dependency: the enforcement engine

~~~mermaid
flowchart LR
  YAML["NetworkPolicy Object\n(Accepted by API)"] --> etcd["etcd"]
  etcd --> CNI["CNI DaemonSet\n(Calico / Cilium / iptables / eBPF)"]
  CNI --> Rules["Host Kernel Packet Filtering"]
~~~

*Diagram SEC-03 — NetworkPolicy is declarative configuration stored in the API; enforcement happens only if the installed CNI contains a policy engine.*

- **The CNI prerequisite**:
  - Kubernetes provides the `networking.k8s.io/v1/NetworkPolicy` API object, but **does not enforce rules itself**.
  - Standard `kindnet` ignores NetworkPolicies completely.
  - A policy-capable CNI (such as **Calico** or **Cilium**) must be installed to translate policies into kernel iptables or eBPF bytecode.

---

## The Default-Deny security posture

A hardened cluster implements zero-trust networking using a two-tier policy:

- **1. Global Default-Deny**:
  - Blocks all incoming (ingress) and outgoing (egress) traffic by default:
  ```yaml
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: default-deny-all
    namespace: apollo-airlines-apps
  spec:
    podSelector: {} # Selects all Pods in namespace
    policyTypes:
      - Ingress
      - Egress
  ```
- **2. Explicit Allow Whitelists**:
  - Open only documented, required communication channels:
  - *Booking $\rightarrow$ Flight*: Allow egress on port 8081.
  - *CoreDNS*: Always explicitly permit egress to port 53 UDP/TCP on `kube-system` DNS Pods, otherwise name resolution breaks immediately.

---

## Evidence and limits

- **1. Verify CNI policy engine active**: Ensure Calico or Cilium is managing network rules:
  ```bash
  kubectl get pods -n calico-system
  ```
- **2. Test blocked path**: Attempt an unauthorized connection (should hang or reject):
  ```bash
  kubectl exec -n apollo-airlines-ui curl-client -- curl --connect-timeout 3 http://booking-db:5432
  ```
- **3. Test allowed path**: Verify authorized paths succeed:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/booking -- curl -s http://flight:8081/readyz
  ```
