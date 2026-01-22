
---

## Ingress and Its Need

### The Problem with standard Services
By default, a Kubernetes `Service` of type `ClusterIP` is only accessible from *inside* the cluster. To expose it to the internet, you have two basic options:

1.  **NodePort**: Opens a high port (30000-32767) on *every* worker node.
    -   *Downside*: Non-standard ports (e.g., dev.com:31254), security risks, and limited port range.
2.  **LoadBalancer**: Asks the cloud provider (AWS/GCP) to provision a physical Load Balancer.
    -   *Downside*: Expensive! It maps 1 Service to 1 Load Balancer. If you have 20 microservices, you pay for 20 LBs.

### The Solution: Ingress
Ingress is a smarter approach. It puts a **Layer 7 (HTTP/HTTPS) Reverse Proxy** inside the cluster.
-   You typically use **only one** Cloud Load Balancer (or one public NodePort/HostPort) to expose the Ingress Controller.
-   The Ingress Controller then routes traffic based on the **Host** (domain) or **Path** to the correct internal Service.
-   It handles SSL termination, redirects, and path rewriting.

---

## Ingress Concepts in Detail

### 1. Ingress Resource (`kind: Ingress`)
This is just a YAML configuration file. It defines the rules:
> "If traffic comes for `api.app.com`, send it to service `api-svc`."

Creating this resource alone does **nothing** if you don't have a controller running.

### 2. Ingress Controller
This is the actual software (Pod) running in your cluster that reads the Ingress Resource and implements rules.
Popular Controllers:
-   **Nginx Ingress Controller** (Standard, widely used)
-   **Traefik** (Modern, dynamic, comes default with K3s)
-   **HAProxy**
-   **Istio Ingress Gateway**

---

## How to Create a Simple Ingress using Traefik

Since K3s often bundles Traefik, here is how you define a standard Ingress V1 resource.

### Prerequisites
1.  A running Kubernetes cluster with Traefik installed.
2.  A deployed application and Service (ClusterIP).

### Example YAML
Save this as `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: simple-webapp-ingress
  namespace: default
  annotations:
    # Optional path stripping or middleware can be defined here
    # traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  rules:
  # Route Option 1: Host-based Routing
  - host: app.example.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-webapp-service  # Target Service Name
            port:
              number: 80             # Target Service Port
```

To test this locally, you would add `app.example.local` to your `/etc/hosts` file pointing to your cluster Node IP.

---

## All Possible Route Options in Ingress

### 1. Host-Based Routing
Routes traffic based on the domain name header.

```yaml
spec:
  rules:
  - host: foo.bar.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: service1
            port:
              number: 80
  - host: bar.foo.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: service2
            port:
              number: 80
```

### 2. Path-Based Routing (Fanout)
Routes traffic based on the URL path for a single host.

```yaml
spec:
  rules:
  - host: my-app.com
    http:
      paths:
      - path: /analytics   # Traffic to my-app.com/analytics -> service-analytics
        pathType: Prefix
        backend:
          service:
            name: service-analytics
            port:
              number: 80
      - path: /shopping    # Traffic to my-app.com/shopping -> service-shopping
        pathType: Prefix
        backend:
          service:
            name: service-shopping
            port:
              number: 80
```

### 3. TLS (HTTPS) Termination
Defines which secret contains the SSL certificates for which host.

```yaml
spec:
  tls:
  - hosts:
      - secure-app.com
    secretName: my-tls-cert-secret # Must contain tls.crt and tls.key
  rules:
  - host: secure-app.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: secure-service
            port:
              number: 443
```

### 4. Default Backend
A catch-all backend for traffic that doesn't match any rule.

```yaml
spec:
  defaultBackend:
    service:
      name: default-error-page-service
      port:
        number: 80
```
