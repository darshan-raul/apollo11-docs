---
title: "Stage 5: Payload Integration — Packaging and Deployment"
description: "Package manifests with Helm, customize with Kustomize overlays, build CI/CD with GitHub Actions, and manage deployments with ArgoCD."
---

# Stage 5: Payload Integration — Packaging and Deployment

**Goal:** Package Kubernetes manifests using Helm charts, customize configurations with Kustomize overlays, build CI/CD pipelines with GitHub Actions, and implement GitOps with ArgoCD.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| **Helm** | Chart packaging | Template and version Kubernetes manifests |
| **Kustomize** | Config patching | Customize base configurations with overlays |
| **CI/CD** | GitHub Actions | Automate testing and deployment |
| **GitOps** | ArgoCD | Declarative deployment management |

---

## Helm

Helm is a package manager for Kubernetes. Charts define complete application stacks.

### Chart Structure

```
mychart/
├── Chart.yaml          # Chart metadata
├── values.yaml          # Default configuration
├── charts/              # Subcharts
└── templates/           # Kubernetes manifests (Go templates)
```

### Key Commands

```bash
helm install <release> <chart>     # Install
helm upgrade <release> <chart>     # Update
helm rollback <release> [rev]     # Revert
helm list                          # List releases
helm template <chart>              # Render without installing
```

---

## Kustomize

Kustomize enables configuration customization without modifying the original manifests.

### Structure

```
base/
├── kustomization.yaml
├── deployment.yaml
└── service.yaml

overlays/
├── dev/
│   ├── kustomization.yaml
│   └── patches/
│       └── replica-count.yaml
└── prod/
    ├── kustomization.yaml
    └── patches/
        └── resource-limits.yaml
```

### Key Commands

```bash
kustomize build overlays/dev      # Build for dev
kubectl apply -k overlays/dev     # Apply directly
```

---

## GitHub Actions CI/CD

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to k8s
        run: |
          kubectl apply -f k8s/
```

---

## ArgoCD (GitOps)

ArgoCD watches a Git repository and syncs changes to the cluster.

### Application Manifest

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: apollo11
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/darshan-raul/Apollo11
    targetRevision: main
    path: stages/stage5/k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: apollo11-apps
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## Key Takeaways

```
Helm: Package manager for Kubernetes (charts, templates, versioning)
Kustomize: Configuration overlays (base + patches = customized)
GitHub Actions: CI/CD pipeline (test → build → deploy)
ArgoCD: GitOps controller (watches Git → syncs to cluster)
```

---

## What's Next

Stage 6 introduces **Mission Ops** — monitoring with Prometheus, Grafana, Loki, and OpenTelemetry.

---

## Coming Soon

Hands-on labs for this stage are currently being developed.