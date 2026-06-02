---
title: "ArgoCD — GitOps Deployment"
description: "Implement declarative, Git-driven deployment with ArgoCD."
---

# ArgoCD — GitOps Deployment

ArgoCD watches a Git repository and automatically syncs changes to the cluster. It enforces the desired state defined in Git.

---

## How ArgoCD Works

```
Git Repository (source of truth)
       │
       ▼ (push/merge)
ArgoCD detects changes
       │
       ▼ (diff against cluster state)
Drift detected → Auto-sync (or manual trigger)
       │
       ▼
Kubernetes cluster updated
```

---

## Application Manifest

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
    path: stages/stage-5/k8s

  destination:
    server: https://kubernetes.default.svc
    namespace: apollo11-apps

  syncPolicy:
    automated:
      prune: true        # Delete resources removed from Git
      selfHeal: true    # Sync if drift detected
      allowEmpty: false
```

---

## Sync Policy

| Option | Behavior |
|--------|----------|
| `automated.prune` | Delete resources no longer in Git |
| `automated.selfHeal` | Sync if cluster state diverges from Git |
| `automated.allowEmpty` | Allow zero replicas after sync |

---

## Sync Options

```yaml
syncOptions:
  - CreateNamespace=true
  - PrunePropagationPolicy=foreground
  - ServerSideApply=true
```

---

## Multi-Environment (App of Apps)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: apollo11-all
spec:
  generators:
    - matrix:
        generators:
          - git:
              repoURL: https://github.com/darshan-raul/Apollo11
              revision: main
              paths:
                - path: clusters/*
          - clusters:
              values:
                namespace: apollo11-apps
  template:
    metadata:
      name: '{{path.basename}}-{{name}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/darshan-raul/Apollo11
        path: '{{path}}/k8s'
        targetRevision: main
      destination:
        server: '{{server}}'
        namespace: '{{values.namespace}}'
```

---

## ArgoCD CLI Commands

```bash
# Login
argocd login argocd-server --username admin --password <secret>

# List applications
argocd app list

# Get app status
argocd app get apollo11

# Sync manually
argocd app sync apollo11

# Rollback
argocd app rollback apollo11

# View logs
argocd app logs apollo11
```

---

## Health Check

```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas

  syncRetry:
    limit: 3
```

---

## Key Takeaways

```
GitOps pattern:
  1. Define desired state in Git
  2. ArgoCD watches and detects drift
  3. Auto-sync keeps cluster matching Git

Application:
  source: Git repo + path
  destination: cluster + namespace
  syncPolicy: automated prune/self-heal

ArgoCD CLI:
  argocd app get      - view status
  argocd app sync    - trigger sync
  argocd app rollback - revert to previous

Multi-environment: ApplicationSet for many apps/envs
```