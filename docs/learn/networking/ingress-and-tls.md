---
title: "Ingress and TLS"
description: "Understand how an Ingress controller translates stored routing rules into a reverse proxy configuration, how TLS termination works at the edge, and what a local certificate cannot prove."
---

# Ingress and TLS

*Stage 2 · Guidance*

Exposing every microservice via its own port forces clients to memorize custom port numbers. Because HTTP requests already convey hostnames in the `Host` header, an edge reverse proxy can accept all traffic on standard web ports (`80` / `443`) and route traffic based on host and path.

---

## Ingress is configuration, not a running proxy

Kubernetes strictly separates the declaration of routing rules from the proxy handling network packets:

- **The `Ingress` resource**: Stored API configuration declaring routes (e.g. `flight.apollo.local` maps to `flight:8081`).
- **The `Ingress Controller` (e.g., Traefik, NGINX)**: An active Pod running reverse proxy software. It watches `Ingress` objects and dynamically updates its internal routing table.

~~~mermaid
flowchart LR
  Browser["Browser\nHost: flight.apollo.local"] -->|HTTPS :30443| Traefik["Traefik proxy\n(Ingress controller)"]
  Traefik -->|Reads| IngressObj["Ingress object:\nflight.apollo.local → flight:8081"]
  Traefik -->|Forwards to| FlightSVC["flight Service\n(ClusterIP)"]
  FlightSVC --> FlightPod["flight Pod\n:8081"]
~~~

*Diagram NW-06 — Ingress is configuration consumed by the controller; the proxy forwards traffic to the backend Service.*

---

## Edge TLS termination

When clients connect over HTTPS:
- **TLS termination**: The secure TLS handshake completes between the client browser and the edge proxy (Traefik).
- **Certificate retrieval**: Traefik loads the public certificate and private key from a Kubernetes Secret (`kubernetes.io/tls`).
- **Upstream forwarding**: Traefik forwards the decrypted HTTP request to the cluster's internal Service over plain HTTP.

### Fallback behavior on missing certificates:
- If the referenced Secret is deleted or invalid, Traefik serves a self-signed fallback certificate (`CN=TRAEFIK DEFAULT CERT`) rather than dropping the TCP connection outright.

---

## What a self-signed certificate does not prove

A local TLS certificate proves encrypted transport in a lab, but does not provide:
- **Browser trust**: Untrusted public certificate authority; browsers will display security warnings.
- **Automated renewal**: Static expiration date with no ACME / Let's Encrypt rotation engine.
- **Edge-to-Pod encryption**: Internal traffic between Traefik and backend Pods travels unencrypted unless mutual TLS (mTLS) is introduced.

---

## Evidence and limits

- **1. Certificate handshake details**: Inspect the active TLS certificate issuer:
  ```bash
  curl -kv --resolve flight.apollo.local:30443:127.0.0.1 \
    https://flight.apollo.local:30443/readyz 2>&1 | grep -E "issuer|subject|expire"
  ```
- **2. Secret inspection**: Confirm certificate and private key existence:
  ```bash
  kubectl describe secret apollo-tls-secret -n apollo-airlines-apps
  ```
- **3. Ingress routing status**: Check host and backend mappings:
  ```bash
  kubectl get ingress -n apollo-airlines-apps
  ```
- **4. Ingress controller logs**: Diagnose proxy configuration reloads:
  ```bash
  kubectl logs -n traefik deploy/traefik | tail -20
  ```
