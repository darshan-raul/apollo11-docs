---
title: "Termination and draining"
description: "Trace the exact sequence of events when a Pod is terminated, understand why preStop hooks prevent connection drops, and name the race that graceful shutdown reduces but cannot eliminate."
---

# Termination and draining

*Stage 4 · Flight Control*

When a Pod is marked for deletion during a rollout or node maintenance drain, in-flight passenger requests must complete cleanly while new connections are diverted away.

Kubernetes coordinates this shutdown through concurrent asynchronous processes.

---

## The Pod termination lifecycle

~~~mermaid
sequenceDiagram
  participant API as kube-apiserver
  participant EP as Endpoint controller
  participant KP as kube-proxy / Envoy
  participant KL as Kubelet
  participant App as booking container

  Note over API,App: kubectl delete / rollout / node drain
  API->>KL: Set Pod phase: Terminating
  API->>EP: Remove Pod IP from EndpointSlice
  par Propagation (async)
    EP->>KP: Update node routing rules
    Note over KP: Takes 1–10s to propagate
  and Kubelet action (concurrent)
    KL->>App: Execute preStop hook (sleep 5)
    Note over App: New requests may still arrive\nwhile routing updates propagate
    KL->>App: Send SIGTERM
    Note over App: Application drains in-flight\nrequests and exits cleanly
    App-->>KL: Process exits (code 0)
  end
  Note over KL,App: If process still alive after terminationGracePeriodSeconds:\nKubelet sends SIGKILL (immediate, forceful)
~~~

*Diagram RL-05 — endpoint removal and preStop run concurrently; neither guarantees the other is complete.*

The sequence unfolds in parallel:
- **1. Status transition**: API server marks the Pod `Terminating` and stops reporting it as ready.
- **2. Endpoint removal**: Endpoint controller strips the Pod IP from active `EndpointSlice` records.
- **3. Route propagation**: Proxies and `kube-proxy` begin updating node iptables or proxy tables asynchronously.
- **4. PreStop hook**: Kubelet initiates the container's `preStop` script.
- **5. SIGTERM**: Kubelet signals the process to begin graceful shutdown.
- **6. SIGKILL fallback**: If the process does not terminate within `terminationGracePeriodSeconds`, the kernel forcibly kills it.

---

## Why `preStop` hooks prevent connection drops

Because iptables and proxy updates take several seconds to propagate across all cluster nodes, incoming requests may still reach the terminating Pod *after* deletion starts.

- **The `preStop` sleep**:
  ```yaml
  lifecycle:
    preStop:
      exec:
        command: ["sleep", "5"]
  ```
- **Operational impact**:
  - Adds an artificial 5-second buffer before sending `SIGTERM`.
  - Gives network routing tables time to drop the backend before the server closes its listening socket.
  - *Warning*: The sleep runs *inside* the grace period budget; it does not extend it.

---

## What application processes must execute upon SIGTERM

A resilient service must implement explicit signal handlers:
- **1. Stop listening**: Reject new incoming HTTP handshakes.
- **2. Drain connections**: Finish processing active requests within the remaining grace window.
- **3. Flush buffers**: Write pending logs, metrics, and database transactions.
- **4. Close connections**: Cleanly close database pools and cache sockets.
- **5. Exit 0**: Terminate before the kubelet resorts to `SIGKILL`.

---

## Evidence and limits

- **1. Endpoint removal tracking**: Watch endpoints drop in real time during a rollout:
  ```bash
  kubectl get endpoints booking -n apollo-airlines-apps -w
  ```
- **2. Kubelet event timestamps**: Review timing between termination and SIGTERM:
  ```bash
  kubectl describe pod <booking-pod> -n apollo-airlines-apps | grep -E "Killing|Stopping"
  ```
- **3. Application shutdown logs**: Confirm graceful connection draining:
  ```bash
  kubectl logs -n apollo-airlines-apps <booking-pod> --previous | tail -15
  ```
