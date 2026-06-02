---
title: "Stage 3: Mission Data — Persistent Storage"
description: "Deploy StatefulSets with PersistentVolumeClaims, use init containers for database initialization, and replace NodePort with Ingress for the frontend."
---

# Stage 3: Mission Data — Persistent Storage

**Goal:** Replace `emptyDir` volumes with PersistentVolumeClaims so data survives pod restarts. Convert database Deployments to StatefulSets for stable pod identity.

---

## What You'll Learn

| Concept | What It Does |
|---|---|
| **PersistentVolumeClaim** | Durable storage that survives restarts |
| **StatefulSet** | Stable ordinal names, at-most-one semantics |
| **VolumeClaimTemplate** | Per-pod PVC (each replica gets unique volume) |
| **Headless Service** | `clusterIP: None` — DNS returns pod IPs directly |
| **Init container** | Runs before main container starts |
| **Ingress (Traefik)** | Replace NodePort, hostname-based routing |

---

## Why emptyDir Isn't Enough

In stages 1 and 2, databases used `emptyDir` volumes:

```yaml
volumes:
  - name: pg-data
    emptyDir: {}   # Deleted when pod terminates!
```

**Problem:**
```
Pod writes data → Pod crashes/is rescheduled → New pod has FRESH emptyDir → Data LOST
```

**Solution:** PersistentVolumeClaim — data survives restarts and node failures.

---

## StatefulSet vs Deployment

| Feature | Deployment | StatefulSet |
|---------|------------|-------------|
| **Pod naming** | Random hash (auth-7d8f9c6b4-xvw2j) | Stable ordinal (auth-postgres-0) |
| **Storage** | Shared emptyDir | Per-pod PVC (each replica has own volume) |
| **Startup order** | Parallel | Sequential (ordinal order: 0 → 1 → 2) |
| **Use case** | Stateless apps | Databases, message queues |

---

## VolumeClaimTemplate Anatomy

```yaml
volumeClaimTemplates:
  - metadata:
      name: postgres-data   # Must match volumeMounts name
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
```

Each StatefulSet replica gets its own PVC: `data-auth-postgres-0`, `data-auth-postgres-1`, etc.

---

## Init Container Pattern

Init containers run **before** the main container starts, on **every pod restart**:

```yaml
initContainers:
  - name: init
    image: postgres:15-alpine
    command:
      - sh
      - -c
      - |
        until pg_isready -h auth-postgres -U postgres; do
          echo "Waiting for auth-postgres..."
          sleep 2
        done
        psql -h auth-postgres -U postgres -d auth -f /init/init.sql || true
    volumeMounts:
      - name: init-script
        mountPath: /init
```

---

## Headless Service for StatefulSet Discovery

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-postgres-headless
spec:
  clusterIP: None   # Headless — DNS returns pod IPs directly
  selector:
    app: auth-postgres
  ports:
    - port: 5432
```

**DNS behavior:**
```bash
# Query the headless service
nslookup auth-postgres-headless.apollo11-infra.svc.cluster.local
# Returns: pod IPs directly (10.244.1.10, 10.244.1.11)

# Each pod has a stable FQDN:
auth-postgres-0.auth-postgres-headless.apollo11-infra.svc.cluster.local
```

---

## Frontend: NodePort → Ingress

**Before (Stage 2):**
```yaml
spec:
  type: NodePort
  ports:
    - nodePort: 30080
```

**After (Stage 3):**
```yaml
# ClusterIP only (Ingress handles external access)
spec:
  type: ClusterIP

# Traefik Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: frontend.apollo11.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

---

## Key Takeaways

```
emptyDir → PVC: Data survives pod restarts and node failures

Deployment → StatefulSet:
  - Stable ordinal names (auth-postgres-0, not random hash)
  - Per-pod PVC (each replica has its own volume)

Init containers:
  - Run before main container on EVERY restart
  - Must be idempotent (CREATE TABLE IF NOT EXISTS)
  - Wait for service readiness (pg_isready)

Headless Service (clusterIP: None):
  - DNS returns pod IPs directly
  - Pods get stable FQDNs

NodePort → Ingress: Frontend uses ClusterIP + Traefik Ingress
```

---

## What's Next

Stage 4 introduces **Flight Control** — liveness/readiness/startup probes, resource requests/limits, and QoS classes.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.