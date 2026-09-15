---
title: "Kustomize — Template-Free Patching"
description: "Customize plain Kubernetes manifests across environments using Kustomize bases, strategic merge patches, and overlays."
---

# Kustomize — Template-Free Patching

While Helm uses Go templates to generate manifests dynamically, **Kustomize** is a template-free tool built directly into `kubectl` (`kubectl apply -k`). It allows you to customize raw, standard Kubernetes YAML manifests without altering the original files.

In Stage 5, Apollo11 includes a full **Kustomize comparison lab** located at `stages/stage5/overlays/`.

---

## The Base & Overlay Architecture

```text
stages/stage5/overlays/
├── base/
│   ├── kustomization.yaml    # References the base manifest
│   └── generated.yaml        # Complete 61-resource committed plain YAML base
├── dev/
│   ├── kustomization.yaml    # Patches: 1 replica per app, image tag=latest
│   └── patches/
│       └── replicas.yaml     # Sets replicas: 1 across all microservices
├── staging/
│   ├── kustomization.yaml    # Patches: 2 replicas per app, image tag=latest
│   └── patches/
│       └── replicas.yaml     # Sets replicas: 2 across all microservices
└── prod/
    ├── kustomization.yaml    # Patches: 3 replicas, tag=v1.0.0, enables PDBs
    └── patches/
        ├── replicas.yaml     # Sets replicas: 3
        └── pdb.yaml          # Stricter PodDisruptionBudget (minAvailable: 2)
```

---

## 1. The Base Layer

The base layer represents the common denominator across all environments. In `stages/stage5/overlays/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - generated.yaml

commonLabels:
  app.kubernetes.io/part-of: apollo11
```

`generated.yaml` contains the full 61-resource definition of Apollo Airlines: namespaces, ConfigMaps, Secrets, 13 ServiceAccounts, 4 StatefulSets, 6 Deployments, Services, HTTPRoutes, and MetalLB configurations.

---

## 2. Environment Overlays & Patches

Overlays inherit from `../../base` and apply targeted modifications using **Strategic Merge Patches**:

### Dev Overlay (`overlays/dev/kustomization.yaml`)

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../base

# Scale all microservices down to 1 replica for local machine efficiency
patches:
  - target:
      kind: Deployment
      name: (identity|flight|booking|search|notification|frontend)
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1

images:
  - name: apollo11/identity
    newTag: latest
  - name: apollo11/booking
    newTag: latest
```

### Production Overlay (`overlays/prod/kustomization.yaml`)

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../base

# Scale microservices to 3 replicas for high availability
patches:
  - target:
      kind: Deployment
      name: (identity|flight|booking|search|notification|frontend)
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 3

# Enforce pinned production releases from GHCR
images:
  - name: apollo11/identity
    newName: ghcr.io/darshan-raul/apollo11/identity
    newTag: v1.0.0
  - name: apollo11/booking
    newName: ghcr.io/darshan-raul/apollo11/booking
    newTag: v1.0.0
```

---

## Hands-On Commands

### 1. Render Overlays Locally
Build the resolved YAML output for inspection without applying it to the cluster:

```bash
# Render dev overlay
kubectl kustomize stages/stage5/overlays/dev | head -n 40

# Render prod overlay and verify 3 replicas
kubectl kustomize stages/stage5/overlays/prod | grep -B 2 "replicas: 3"
```

### 2. Deploy an Overlay

```bash
# Using the Stage 5 orchestrator (recommended)
bash stages/stage5/scripts/apply.sh --mode kustomize --env dev

# Or directly with kubectl
kubectl apply -k stages/stage5/overlays/dev
```

### 3. Verify Deployed Overlays

```bash
# Verify deployments run 1 replica in dev
kubectl get deployments -n apollo-airlines-apps

# Run verification suite
bash stages/stage5/scripts/verify.sh --mode kustomize --env dev
```

### 4. Teardown

```bash
bash stages/stage5/scripts/teardown.sh --mode kustomize --env dev
```

---

## Helm vs Kustomize: Architectural Comparison

| Feature | Helm 3 | Kustomize |
|---|---|---|
| **Templating Paradigm** | Go text/template (`{{ .Values... }}`) | Template-free (pure YAML strategic merge patches) |
| **Tooling Dependency** | Requires `helm` CLI | Built into native `kubectl` (`-k`) |
| **State Management** | Stores release history in cluster Secrets | Stateless; client-side manifest generation |
| **Rollback Mechanism** | Native `helm rollback <release> <rev>` | `git revert` + re-apply manifest |
| **Package Distribution** | Can package, version, and publish tarballs | Distributed as plain Git repositories |
| **Best Used For** | Reusable, distributable third-party software | Environment-specific config management (dev/prod) |

In Apollo11, **Helm** serves as the canonical deployment path for future stages, while **Kustomize** provides an essential understanding of template-free manifest customization.