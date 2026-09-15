---
title: "Helm — Production Chart Packaging"
description: "Package, parameterize, and version Apollo Airlines with Helm 3 templates, environment values files, and release lifecycles."
---

# Helm — Production Chart Packaging

**Helm** is the official package manager for Kubernetes. In Stage 5, the entire Apollo Airlines application fleet is packaged into a production-ready Helm chart located at `stages/stage5/helm/apollo11/`.

---

## Chart Directory Layout

```text
stages/stage5/helm/apollo11/
├── Chart.yaml                      # Chart metadata (version 1.0.0, appVersion 1.0.0)
├── values.yaml                     # Default configuration values
├── values-dev.yaml                 # Dev overlay: 1 replica, :latest tag, no PDBs
├── values-staging.yaml             # Staging overlay: 2 replicas, :latest tag, no PDBs
├── values-prod.yaml                # Prod overlay: 3 replicas, :v1.0.0 tag, full PDBs
├── bundles/
│   ├── envoy-gateway-install.yaml  # Envoy Gateway v1.5.0 offline bundle
│   └── metallb-native.yaml         # MetalLB v0.14.5 offline bundle
└── templates/
    ├── _helpers.tpl                # Reusable Go template helpers (labels, names)
    ├── config/
    │   ├── serviceaccount.yaml     # 13 dedicated ServiceAccounts (token automount disabled)
    │   ├── configmap.yaml          # Service URLs and database settings
    │   └── secrets.yaml            # Database credentials and JWT signing secret
    ├── infra/
    │   ├── postgres.yaml           # 3 PostgreSQL StatefulSets + Headless SVCs + init SQL
    │   └── redis.yaml              # Redis StatefulSet + Headless SVC
    ├── apps/
    │   ├── identity.yaml
    │   ├── flight.yaml
    │   ├── booking.yaml            # Flagship tier: 200m CPU / 256Mi RAM
    │   ├── search.yaml
    │   └── notification.yaml
    ├── ui/
    │   └── frontend.yaml           # React SPA NGINX deployment
    ├── pdb/
    │   └── pdb.yaml                # booking-pdb, frontend-pdb (minAvailable: 1 or 2)
    ├── jobs/
    │   └── seed.yaml               # 3 idempotent database seed Jobs
    └── gateway/
        ├── gateway.yaml            # GatewayClass + Gateway
        ├── httproutes.yaml         # 6 HTTPRoutes + 1 ReferenceGrant
        ├── envoy-install.yaml      # Installs Envoy Gateway controller bundle
        ├── metallb.yaml            # IPAddressPool + L2Advertisement
        └── metallb-install.yaml    # Installs MetalLB controller bundle
```

---

## Key Values Configuration

Open `values.yaml` to inspect how Apollo Airlines is parameterized:

```yaml
# Global image settings
image:
  repository: apollo11
  tag: latest
  pullPolicy: IfNotPresent

# App workload tiers & replicas
apps:
  identity:
    replicas: 2
    tier: default      # 100m CPU / 128Mi RAM
  flight:
    replicas: 2
    tier: default
  booking:
    replicas: 2
    tier: flagship     # 200m CPU / 256Mi RAM
  search:
    replicas: 2
    tier: default
  notification:
    replicas: 2
    tier: low          # 50m CPU / 64Mi RAM
  frontend:
    replicas: 2
    tier: edge         # 50m CPU / 64Mi RAM

# PodDisruptionBudget toggle
pdb:
  enabled: true
  minAvailable: 1

# Edge routing configuration
gateway:
  enabled: true
  hostSuffix: apollo.local

metallb:
  enabled: true
  ipPool:
    addresses:
      - 172.18.0.50-172.18.0.100
```

---

## Environment Overlays

Helm supports overriding values at install or upgrade time using the `-f` flag:

### `values-dev.yaml`
```yaml
# Tuned for local machine resources
image:
  tag: latest
apps:
  identity: { replicas: 1 }
  flight:   { replicas: 1 }
  booking:  { replicas: 1 }
  search:   { replicas: 1 }
  notification: { replicas: 1 }
  frontend: { replicas: 1 }
pdb:
  enabled: false
```

### `values-prod.yaml`
```yaml
# Tuned for high availability and pinned releases
image:
  repository: ghcr.io/darshan-raul/apollo11
  tag: v1.0.0
  pullPolicy: Always
apps:
  identity: { replicas: 3 }
  flight:   { replicas: 3 }
  booking:  { replicas: 3 }
  search:   { replicas: 3 }
  notification: { replicas: 3 }
  frontend: { replicas: 3 }
pdb:
  enabled: true
  minAvailable: 2
```

---

## Hands-On Helm Lifecycle Commands

### 1. Lint the Chart
Verify syntax, formatting, and template correctness:

```bash
helm lint stages/stage5/helm/apollo11
```

### 2. Render Manifests Locally (`dry-run`)
Generate the resolved YAML manifests without touching the Kubernetes cluster:

```bash
helm template apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml > /tmp/rendered-dev.yaml

head -n 40 /tmp/rendered-dev.yaml
```

### 3. Install the Release

```bash
# Using the Stage 5 orchestrator (recommended)
bash stages/stage5/scripts/apply.sh --env dev

# Or directly via Helm CLI
helm install apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml
```

### 4. Inspect Active Releases

```bash
# List all Helm releases across the cluster
helm list -A

# Check release status and user-supplied values
helm status apollo11
helm get values apollo11
```

### 5. Upgrade the Release
Upgrade from `dev` configuration (1 replica) to `staging` configuration (2 replicas):

```bash
helm upgrade apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-staging.yaml

# Watch replicas scale to 2
kubectl get deployments -n apollo-airlines-apps
```

### 6. Roll Back a Release

View revision history and revert to revision 1:

```bash
# View release history
helm history apollo11

# Roll back to previous revision
helm rollback apollo11 1

# Verify replicas scale back down to 1
kubectl get deployments -n apollo-airlines-apps
```

### 7. Uninstall the Release

```bash
helm uninstall apollo11
```

---

## Best Practices Learned

1. **Avoid Huge Chart Release Secrets:** Kubernetes Secret objects are limited to 1 MiB. Embedding massive CRD bundles directly inside Helm templates can cause Helm secrets to exceed this limit. Apollo11 vendors CRDs cleanly in `bundles/`.
2. **Deterministic Label Helpers:** Use `_helpers.tpl` to generate uniform `app.kubernetes.io/name`, `app.kubernetes.io/instance`, and `app.kubernetes.io/managed-by` labels.
3. **Immutability in Production:** Never use `:latest` in production `values-prod.yaml`. Always pin explicit semantic version tags (e.g. `:v1.0.0`) or git commit SHAs to guarantee reproducible deployments.