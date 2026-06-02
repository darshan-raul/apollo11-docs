---
title: "k3s Homelab Setup"
description: "Build a homelab using k3s and expose services securely via Cloudflare Tunnel or Tailscale."
---

# k3s Homelab Setup

k3s is a lightweight Kubernetes distribution ideal for homelabs. It runs on low-resource hardware and can be exposed securely via Cloudflare Tunnel or Tailscale.

---

## Why k3s for Homelab?

| Feature | k3s | Standard k8s |
|---------|-----|--------------|
| **Binary size** | ~60MB | ~100MB+ |
| **Memory usage** | ~512MB | ~2GB+ |
| **External database** | SQLite (built-in) | etcd (separate) |
| **Installation** | Single command | Multi-step |

---

## Hardware Recommendations

| Role | Minimum | Recommended |
|------|---------|-------------|
| **Control plane** | 1 CPU, 1GB RAM | 2 CPU, 4GB RAM |
| **Worker** | 1 CPU, 512MB RAM | 2 CPU, 2GB RAM |
| **Storage** | 20GB SSD | 100GB+ NVMe |

---

## Installing k3s (Single Node)

```bash
# Master node (control plane + worker in one)
curl -sfL https://get.k3s.io | sh -

# Check status
kubectl get nodes
```

---

## Multi-Node Setup

### Server Node (Control Plane)

```bash
curl -sfL https://get.k3s.io | K3S_TOKEN="your-secret-token" sh -
```

### Agent Node (Worker)

```bash
curl -sfL https://get.k3s.io | K3S_URL="https://server-node:6443" K3S_TOKEN="your-secret-token" sh -
```

---

## Accessing from Outside

### Option 1: Cloudflare Tunnel (Recommended)

```bash
# Install cloudflared on the node
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Create tunnel
cloudflared tunnel create apollo11-homelab
cloudflared tunnel route dns apollo11-homelab your-domain.cloudflarestunnel.com

# Run tunnel (Kubernetes deployment)
cloudflared tunnel run --token <your-token>
```

### Option 2: Tailscale

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Login and authenticate
tailscale up --accept-dns=false

# Use Tailscale as a VPN to access cluster
kubectl get nodes -o wide  # via Tailscale IP
```

---

## Exposing Services with Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: homelab-services
  annotations:
    kubernetes.io/ingress.class: traefik
spec:
  rules:
    - host: home.apollo11.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: home-dashboard
                port:
                  number: 80
```

---

## Useful Tools for Homelab

| Tool | Purpose |
|------|---------|
| **k9s** | Terminal UI for cluster management |
| **Headlamp** | Web-based Kubernetes dashboard |
| **Kube-vip** | Load balancer for bare metal |
| **Longhorn** | Distributed block storage |
| **Cloudflare Tunnel** | Expose services without opening ports |

---

## Homelab Architecture Example

```
                Internet
                    │
         Cloudflare Tunnel
                    │
                    ▼
           ┌─────────────────┐
           │   Home Network  │
           │                 │
           │  ┌───────────┐  │
           │  │  k3s node │  │
           │  │ (control  │  │
           │  │  plane)   │  │
           │  └───────────┘  │
           │                 │
           │  ┌───────────┐  │
           │  │ k3s worker│  │
           │  └───────────┘  │
           └─────────────────┘
                    │
              Tailscale VPN
                    │
              (Remote access)
```

---

## Key Takeaways

```
k3s: Lightweight k8s (~60MB binary, ~512MB RAM)

Single node:
  curl -sfL https://get.k3s.io | sh -

Multi-node:
  Server: K3S_TOKEN=<secret> curl -sfL https://get.k3s.io | sh -
  Agent:  K3S_URL=https://server:6443 K3S_TOKEN=<secret> curl -sfL https://get.k3s.io | sh -

External access:
  Cloudflare Tunnel - no open ports, managed DNS
  Tailscale - VPN mesh networking

Homelab tools: k9s, Headlamp, Longhorn, Kube-vip
```