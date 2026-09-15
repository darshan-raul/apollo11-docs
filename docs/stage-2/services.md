---
title: "Service Types & NodePort External Access"
description: "Comparison of ClusterIP, NodePort, LoadBalancer, and Headless services, plus hands-on NodePort exposure and targetPort failure experiments."
---

# Service Types & NodePort External Access

A Kubernetes **Service** is an abstraction that defines a logical set of Pods and a policy by which to access them. Because Pods are created and destroyed dynamically, Services provide the stable IP address and DNS name required for reliable communication.

This section covers **Substage 2 (`02-nodeport`)** of the Stage 2 networking ladder.

---

## The Four Kubernetes Service Types

| Service Type | Scope | Virtual IP? | Primary Use Case |
|---|---|---|---|
| **ClusterIP** | In-cluster only | Yes (Cluster-internal VIP) | Default. East-West microservice-to-microservice traffic |
| **NodePort** | External & internal | Yes + static port on every Node (30000–32767) | Direct external access for local dev, debugging, or bare-metal edge |
| **LoadBalancer** | External | Yes + cloud/local external IP | Production North-South traffic (integrated with cloud LBs or MetalLB) |
| **Headless** (`clusterIP: None`) | In-cluster only | No | Direct Pod addressing for StatefulSets (introduced in Stage 3) |

---

## How NodePort Works

A `NodePort` service builds directly on top of `ClusterIP`. When created:
1. Kubernetes allocates a cluster-internal virtual IP (`ClusterIP`).
2. Kubernetes reserves a static port from the node port range (default `30000–32767`) on **every node** in the cluster.
3. `kube-proxy` writes routing rules (iptables or IPVS) on every node. Any packet arriving at `NodeIP:NodePort` is forwarded to a healthy backend Pod's `targetPort`.

```text
External Client
    │
    ▼ HTTP :30083
Node Interface (e.g. 127.0.0.1:30083 on kind-worker)
    │
    ▼
kube-proxy iptables rule
    │
    ▼
Forward to Pod IP:8080 (targetPort)
```

### NodePort Port Mapping Terminology

```yaml
apiVersion: v1
kind: Service
metadata:
  name: identity
  namespace: apollo-airlines-apps
spec:
  type: NodePort
  selector:
    app: identity
  ports:
    - name: http
      port: 8080        # ClusterIP port inside the cluster
      targetPort: 8080  # Port the container listens on inside the Pod
      nodePort: 30083   # Static port opened on every cluster Node
```

---

## Hands-On Lab: Substage 2

### 1. Deploy Substage 2

Deploy the NodePort definitions for Apollo Airlines:

```bash
./stages/stage2/scripts/apply.sh --substage 2 --skip-build
```

### 2. Inspect NodePort Services

Check the services in both namespaces:

```bash
# Backend apps in apollo-airlines-apps
kubectl get svc -n apollo-airlines-apps -o wide

# Frontend in apollo-airlines-ui
kubectl get svc -n apollo-airlines-ui -o wide
```

Notice the assigned high ports:
- `frontend`: NodePort `30080`
- `flight`: NodePort `30081`
- `booking`: NodePort `30082`
- `identity`: NodePort `30083`
- `search`: NodePort `30084`

### 3. Verify Direct Access from Host

Test connectivity directly from your host terminal using `localhost`:

```bash
# Query Identity service health
curl -i http://localhost:30083/healthz

# Query Flight inventory
curl -s http://localhost:30081/api/flights | jq '.flights | length'

# Query Booking readiness
curl -i http://localhost:30082/readyz

# Query Frontend HTML
curl -i http://localhost:30080/
```

Every service responds directly on its assigned high port.

---

## Break & Recover: targetPort Mismatch Experiment

What happens when `nodePort` is open, but `targetPort` points to the wrong container port?

### 1. Break the `targetPort`

Patch the `identity` service so its `targetPort` points to port `9999` (where no process is listening):

```bash
kubectl patch service identity -n apollo-airlines-apps \
  --type='json' -p='[{"op": "replace", "path": "/spec/ports/0/targetPort", "value": 9999}]'
```

Inspect the service:

```bash
kubectl get svc identity -n apollo-airlines-apps
```

Now try to query the service from your host machine:

```bash
curl -i --connect-timeout 3 http://localhost:30083/healthz
```

**Observation:** The connection fails or resets (`curl: (56) Recv failure: Connection reset by peer` or `Connection refused`). 
Even though the NodePort (30083) was reached on the host, `kube-proxy` forwarded the packet to container port `9999`, which refused the connection.

### 2. Recover the `targetPort`

Restore the correct `targetPort: 8080`:

```bash
kubectl patch service identity -n apollo-airlines-apps \
  --type='json' -p='[{"op": "replace", "path": "/spec/ports/0/targetPort", "value": 8080}]'
```

Verify recovery:

```bash
curl -i http://localhost:30083/healthz
# Returns: HTTP/1.1 200 OK
```

---

## Why NodePort is Not Used for Production Edge Traffic

While convenient for local testing, NodePort has severe operational limitations:
1. **Port Exhaustion:** Restricted to high ports (`30000–32767`). You cannot expose standard ports `80` or `443` directly.
2. **No L7 Routing:** NodePort operates strictly at Layer 4 (TCP/UDP). It cannot inspect HTTP `Host` headers or URL paths to route multiple domains through a single entry point.
3. **No Centralized TLS Termination:** Every application would have to manage its own TLS certificates and decryption overhead.
To solve these limitations, we step up to **Ingress Controllers** in Substage 3.

---

## Explain & Review Questions

1. **What is the difference between `port`, `targetPort`, and `nodePort` in a Service definition?**
   `port` is the internal port on the ClusterIP; `targetPort` is the port the container process is actually listening on inside the Pod; `nodePort` is the static high port opened on every host node's network interface.

2. **If a Pod crashes and gets a new IP address, do you need to update the NodePort Service?**
   No. The Service dynamically updates its EndpointSlice when Pods restart with new IPs, keeping the routing intact.

3. **Why do connections fail if the `targetPort` is incorrect, even if the Service and Endpoints are active?**
   Because `kube-proxy` forwards the packets to the Pod IP successfully, but the container's network namespace refuses the connection since no process is listening on the mismatched port.