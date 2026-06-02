---
title: "Kustomize — Configuration Patching"
description: "Customize base Kubernetes configurations with Kustomize overlays and strategic merge patches."
---

# Kustomize — Configuration Patching

Kustomize enables configuration customization without modifying the original manifests. Use overlays to apply environment-specific changes.

---

## Structure

```
.
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
│
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── patches/
    │       ├── replicas.yaml
    │       └── resources.yaml
    └── prod/
        ├── kustomization.yaml
        └── patches/
            └── resources.yaml
```

---

## Base: kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml

commonLabels:
  app: apollo11

namespace: apollo11-apps
```

---

## Overlay: dev/kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namespace: apollo11-dev

patches:
  - path: patches/replicas.yaml
  - path: patches/resources.yaml

replicas:
  - name: auth
    count: 1
```

---

## Patch: patches/replicas.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth
spec:
  replicas: 1
```

---

## Patch: patches/resources.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth
spec:
  template:
    spec:
      containers:
        - name: auth
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
```

---

## Common Operations

### Adding Labels/Annotations

```yaml
commonLabels:
  app: apollo11
  environment: dev

commonAnnotations:
  maintainer: team@apollo11.local
```

### ConfigMap Generator

```yaml
configMapGenerator:
  - name: app-config
    literals:
      - DATABASE_URL=postgres://auth-postgres:5432/auth
      - LOG_LEVEL=debug
```

### Secret Generator

```yaml
secretGenerator:
  - name: app-secrets
    literals:
      - password=supersecret
    files:
      - credentials.txt
```

---

## Build and Apply

```bash
# Build (render without applying)
kustomize build overlays/dev

# Apply directly
kubectl apply -k overlays/dev

# Dry-run
kubectl apply -k overlays/dev --dry-run=server
```

---

## Overlay Types

| Type | When to Use |
|------|-------------|
| **patches/small changes** | Modify specific fields (replicas, resources) |
| **patchesJson6902** | Complex JSON patch for precise changes |
| **images** | Change image tags/registries |
| **replicas** | Change replica counts |

---

## Key Takeaways

```
Kustomize structure:
  base/           - shared manifests
  overlays/dev/   - development overrides
  overlays/prod/  - production overrides

kustomization.yaml:
  resources:      - files to include
  patches:        - strategic merge patches
  commonLabels:   - labels applied to all

Commands:
  kustomize build - render manifests
  kubectl apply -k - apply from kustomization
```