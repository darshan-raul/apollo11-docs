---
title: "Ingress and Its Need"
description: "HTTP/HTTPS hostname-based routing using Traefik."
---

# Ingress and Its Need

## The Problem with Standard Services

By default, a Kubernetes `Service` of type `ClusterIP` is only accessible **from inside the cluster**.

Options for external access:
- **NodePort**: Opens port 30000-32767 on every node (non-standard ports)
- **LoadBalancer**: Cloud provider provisions a load balancer (expensive — one per Service)

---

## The Solution: Ingress

Ingress puts a **Layer 7 (HTTP/HTTPS) Reverse Proxy** inside the cluster:
- Use **one** LoadBalancer (or NodePort) to expose the Ingress Controller
- The Ingress Controller routes traffic by **Host** or **Path** to backends

---

## Ingress Resource

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: apollo11-ingress
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: identity.apollo11.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: identity
                port:
                  number: 8080
    - host: flight.apollo11.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: flight
                port:
                  number: 8081
```

---

## Routing Options

### 1. Host-Based Routing

```yaml
rules:
  - host: identity.apollo11.local
    http:
      paths:
        - path: /
          backend:
            service:
              name: identity
  - host: flight.apollo11.local
    http:
      paths:
        - path: /
          backend:
            service:
              name: flight
```

### 2. Path-Based Routing (Fanout)

```yaml
rules:
  - host: my-app.com
    http:
      paths:
        - path: /api
          pathType: Prefix
          backend:
            service:
              name: api-svc
        - path: /web
          pathType: Prefix
          backend:
            service:
              name: web-svc
```

### 3. TLS Termination

```yaml
spec:
  tls:
    - hosts:
        - secure-app.com
      secretName: my-tls-cert
  rules:
    - host: secure-app.com
      ...
```

---

## Key Takeaways

```
Ingress: HTTP/HTTPS hostname-based routing to backends

Host-based: identity.apollo11.local → identity, flight.apollo11.local → flight
Path-based: example.com/api → api-svc, example.com/web → web-svc

Ingress Controller: The actual proxy (Traefik, nginx, Envoy)
Ingress Resource: The routing rules (watched by controller)

Use one LoadBalancer + Ingress instead of one per Service
```