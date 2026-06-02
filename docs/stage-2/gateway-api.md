---
title: "Gateway API — Next-Generation Routing"
description: "Gateway API (Envoy Gateway) provides typed routing with Gateway + HTTPRoute resources."
---

# Gateway API — Next-Generation Routing

Gateway API is the successor to Ingress. It uses typed resources instead of annotations.

---

## Why Gateway API?

| Ingress (Legacy) | Gateway API |
|---|---|
| `kind: Ingress` only | `Gateway` + `HTTPRoute` |
| Annotations for features | Native fields (typed) |
| Single namespace | Cross-namespace via ReferenceGrant |

---

## Gateway

The **Gateway** is the listener infrastructure — owns a port.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: apollo11-gateway
  namespace: apollo11-apps
spec:
  gatewayClassName: envoy
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: same
```

---

## HTTPRoute

The **HTTPRoute** defines routing rules.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: catalog-route
spec:
  parentRefs:
    - name: apollo11-gateway
      sectionName: http
  hostnames:
    - catalog.apollo11.local
  rules:
    - backendRefs:
        - name: catalog
          port: 8081
```

---

## Ingress vs Gateway API

### Ingress (Traefik)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  ingressClassName: traefik
  rules:
    - host: api.apollo11.local
      http:
        paths:
          - backend:
              service:
                name: auth
                port:
                  number: 8080
```

### Gateway API (Envoy)

```yaml
# Gateway (listener)
# HTTPRoute (routing rules) - separated concerns
```

---

## Traffic Weighting (Canary Deployments)

```yaml
rules:
  - backendRefs:
      - name: catalog-stable
        port: 8081
        weight: 90          # 90% to stable
      - name: catalog-canary
        port: 8081
        weight: 10          # 10% to canary
```

---

## Key Takeaways

```
Gateway API separates concerns:
  - Gateway: listener (port 80, which controller)
  - HTTPRoute: routing rules (host + path → backend)

GatewayClass: which controller (envoy, nginx, traefik)
parentRefs: attach HTTPRoute to Gateway
hostnames: which hosts this route handles

Cross-namespace: ReferenceGrant required
Traffic weighting: weight field on backendRefs
```