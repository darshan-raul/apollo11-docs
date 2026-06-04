---
title: "Stage 10: Mission Extensions"
description: "Service mesh, progressive deployments, DevSecOps, backup/restore, and chaos engineering."
---

# Stage 10: Mission Extensions

**Goal:** Add production-grade capabilities — service mesh traffic management, progressive delivery, security scanning in CI/CD, backup/restore, and chaos engineering.

---

## What You'll Learn

| Concept | Tool | What It Does |
|---|---|---|
| **Service mesh** | Linkerd | mTLS between services, traffic splitting, retries |
| **Progressive delivery** | Argo Rollouts | Canary releases, blue-green, automated analysis |
| **DevSecOps** | Trivy, Gitleaks | Scan images and code for vulnerabilities in CI |
| **Backup/Restore** | Velero + Rook | Backup cluster state, restore to new cluster |
| **Chaos engineering** | Chaos Mesh | Induce failures to test resilience |

---

## Service Mesh (Linkerd)

Linkerd adds transparent mTLS, retries, timeouts, and traffic splitting without changing application code.

### Why a service mesh?

Without it, service-to-service authentication and authorization must be built into each application. A mesh pushes this to the infrastructure layer:

```
Without mesh:  auth → catalog → (catalog checks "is auth authorized?")
With mesh:     auth → catalog (mTLS auto-on, policy enforced by mesh)
```

### Linkerd setup

```bash
# Install Linkerd CLI
curl -sL https://run.linkerd.io/install | sh

# Inject into your namespaces (adds sidecar proxy)
kubectl get ns -o yaml | linkerd inject - | kubectl apply -f -
```

---

## Argo Rollouts

Replaces the Deployment's rolling strategy with canary, blue-green, and experimental traffic management.

### Canary example

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: booking
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: {duration: 10m}
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - analysis:
            templates:
              - templateName: success-rate
            args:
              - name: service-name
                value: booking
```

---

## DevSecOps — Security in CI

### Trivy image scanning

```yaml
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
    format: sarif
    exit-code: '1'  # Fail if critical vulnerabilities found
```

### Gitleaks (secret scanning)

```yaml
- name: Scan for secrets in code
  uses: gitleaks/gitleaks-action@v2
```

---

## Velero (Backup & Restore)

### Backup

```bash
velero backup create apollo11-backup \
  --include-namespaces apollo11-infra,apollo11-apps,apollo11-ui
```

### Restore

```bash
velero restore create apollo11-restore \
  --from-backup apollo11-backup
```

---

## Chaos Mesh

Test resilience by injecting failures:

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-booking-pod
spec:
  action: pod-kill
  mode: one
  selector:
    labelSelectors:
      app: booking
```

---

## Key Takeaways

```
Linkerd:       mTLS, retries, timeouts, traffic splitting — zero app changes
Argo Rollouts: Canary/blue-green with automatic analysis
Velero:        Cluster backup/restore to object storage (S3/GCS/Azure Blob)
Chaos Mesh:    Inject failures to validate resilience
```

---

## What's Next

[Stage 11](./stage-11) — Kubernetes operators, homelab with k3s, autoscaling with KEDA, and internal developer platforms.