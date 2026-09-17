---
title: "Stage 5 — Payload Integration: Helm, Kustomize & GitOps"
description: "Package, parameterize, validate, and reconcile Apollo Airlines across environments using Helm charts, Kustomize overlays, CI pipelines, and Argo CD."
sidebar_label: "Stage 5: Packaging (Helm & GitOps)"
---

# Stage 5: Payload Integration — Helm, Kustomize & GitOps

Stages 1–4 made the resource graph visible: Deployments refer to templates,
Services refer to labels, and databases refer to claims. Copying that graph for
each environment creates a new failure mode—two copies that look similar but
quietly drift apart. Stage 5 asks how the same intent can be rendered and
tracked without hiding what Kubernetes will actually receive.

The practical questions are:
- How do you deploy the exact same application to `dev` (1 replica, minimal memory), `staging` (2 replicas), and `production` (3 replicas, strict PDBs, production images) without copy-pasting hundreds of lines of YAML?
- How do you version releases and restore a prior revision if an upgrade fails?
- How do you detect and reconcile drift between cluster state and Git?

In **Stage 5 (Payload Integration)**, we package Apollo Airlines into a Helm
chart, contrast it with Kustomize overlays, inspect the repository's GitHub
Actions CI, and reconcile state with Argo CD GitOps. These are delivery
building blocks; the chart alone does not make the platform production-ready.

```mermaid
flowchart TD
  subgraph SourceControl ["Git Repository (Single Source of Truth)"]
    HC["Helm Chart (helm/apollo11/)"]
    VDEV["values-dev.yaml (1 replica)"]
    VPROD["values-prod.yaml (3 replicas)"]
    KO["Kustomize (overlays/dev, prod)"]
  end

  subgraph DeliveryMechanisms ["Packaging & Delivery Engines"]
    HelmEng["Helm Engine\n(helm install / upgrade)"]
    KustEng["Kustomize Engine\n(kubectl apply -k)"]
    ArgoEng["Argo CD Controller\n(GitOps Reconciliation & Self-Healing)"]
  end

  subgraph Environments ["Rendered Environment Configuration"]
    DevNS["Dev values\n- 1 Replica per app\n- Tag: :latest\n- PDBs disabled"]
    ProdNS["Prod values\n- 3 Replicas per app\n- Tag: :v1.0.0\n- PDBs enabled"]
  end

  HC --> HelmEng
  VDEV --> HelmEng
  VPROD --> HelmEng
  KO --> KustEng

  HelmEng --> DevNS
  HelmEng --> ProdNS
  ArgoEng <-->|Watches Git & Reconciles Drift| SourceControl
  ArgoEng -->|Automated Sync & Self-Heal| DevNS
```

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Understand the architecture of a **Helm chart** (`Chart.yaml`, `values.yaml`, `templates/`, `_helpers.tpl`).
2. Read and write Go template expressions, conditionals, and indentation helpers (`nindent`).
3. Manage multi-environment configurations using **values files** (`values-dev.yaml` vs `values-prod.yaml`).
4. Contrast Helm's templating model with **Kustomize's overlay and patching model**.
5. Inspect Helm release history and perform automated rollbacks.
6. Understand GitOps principles and observe **Argo CD drift detection and self-healing**.

---

## 📦 Helm has two outputs: YAML and a release record

A **Chart** is source material: templates plus values. `helm template` renders
that source into ordinary Kubernetes YAML without contacting the cluster.
`helm install` or `helm upgrade` additionally sends the rendered objects to the
API server and records a release revision. Do not collapse those two actions
into “Helm deploys YAML”; Exercise 1 and Exercise 2 deliberately let you inspect
the boundary.

### Chart Anatomy

*Source: `stages/stage5/helm/apollo11/`*

```text
helm/apollo11/
├── Chart.yaml              # Package metadata (name, version 1.0.0, description)
├── values.yaml             # Default configuration values
├── values-dev.yaml         # Dev overrides (1 replica, :latest tag, no PDBs)
├── values-staging.yaml     # Staging overrides (2 replicas, :latest tag)
├── values-prod.yaml        # Prod overrides (3 replicas, :v1.0.0 tag, full PDBs)
├── bundles/                # Static dependencies (Envoy Gateway, MetalLB)
└── templates/              # Go-templated Kubernetes manifests
    ├── _helpers.tpl        # Reusable template functions (labels, names)
    ├── config/             # ConfigMap, Secret, ServiceAccounts
    ├── infra/              # PostgreSQL & Redis StatefulSets + Headless SVCs
    ├── apps/               # Application Deployments & Services
    ├── ui/                 # Frontend Deployment & Service
    ├── gateway/            # Gateway, HTTPRoutes, ReferenceGrant
    └── pdb/                # PodDisruptionBudgets
```

### A template is a program that emits YAML

In Helm, YAML files inside `templates/` are Go-template programs evaluated against values.

Let's examine how the `booking` Deployment is templated:

*Source: `stages/stage5/helm/apollo11/templates/apps/booking.yaml`; abridged
template with environment and probe blocks explicitly omitted.*

```yaml
{{- $name := "booking" -}}
{{- $appCfg := index .Values.apps $name -}}
{{- $tier := index .Values.tiers $appCfg.tier -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $name }}
  namespace: {{ .Values.namespaces.apps }}
  labels:
    {{- include "apollo11.labels" . | nindent 4 }}
    app: {{ $name }}
spec:
  replicas: {{ $appCfg.replicas }}
  selector:
    matchLabels:
      app: {{ $name }}
  template:
    metadata:
      labels:
        {{- include "apollo11.podLabels" (dict "root" . "name" $name) | nindent 8 }}
    spec:
      serviceAccountName: {{ $name }}
      containers:
        - name: {{ $name }}
          image: "{{ .Values.image.repository }}/{{ $name }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          # ...ports, environment variables, and probes omitted...
          resources:
            requests:
              cpu: {{ $tier.cpu }}
              memory: {{ $tier.memory }}
            limits:
              cpu: {{ $tier.cpu }}
              memory: {{ $tier.memory }}
```

### Trace one value to a rendered field

Start with the dev value for `apps.booking.replicas`, then find
`$appCfg.replicas` in the template, then inspect `spec.replicas` in the rendered
Deployment. That three-step trace is more reliable than trying to mentally
evaluate a chart from braces alone.

1. **`{{-` and `-}}` (Whitespace Trimming)**:
   The hyphen strips leading or trailing whitespace. In YAML, unintended extra spaces or newlines can corrupt the indentation structure.
2. **`nindent 4` / `nindent 8`**:
   `nindent N` inserts a newline followed by $N$ spaces before every line of rendered text.
   Notice: `metadata.labels` needs 4 spaces of indentation, while `spec.template.metadata.labels` needs 8 spaces! Using `nindent` ensures helper outputs align perfectly with the surrounding YAML hierarchy.
3. **Environment Values Hierarchy**:
   When you run `helm install -f values.yaml -f values-prod.yaml`, Helm merges values from left to right. Keys defined in `values-prod.yaml` override identical keys in `values.yaml`.

| Configuration | `values-dev.yaml` | `values-prod.yaml` |
|---|---|---|
| Replicas per app | `1` | `3` |
| Image tag | `latest` | `v1.0.0` (immutable) |
| PodDisruptionBudgets | `enabled: false` | `enabled: true` |
| Resource Tier | `low` / `default` | `flagship` / `default` |

---

## 🔧 Kustomize changes an object graph after reading it

While Helm evaluates templates before objects exist, **Kustomize** starts from
objects and composes transformations over them. It still produces Kubernetes
YAML; it simply moves the variation mechanism from template expressions to an
overlay declaration.

*Source: `stages/stage5/overlays/dev/kustomization.yaml`*

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../base

labels:
  - includeSelectors: false
    pairs:
      environment: dev

replicas:
  - name: identity
    count: 1
  - name: flight
    count: 1
  - name: booking
    count: 1
  - name: search
    count: 1
  - name: notification
    count: 1
  - name: frontend
    count: 1

images:
  - name: apollo11/booking
    newTag: latest
```

### When to use Helm vs. Kustomize?
- **Use Helm** when creating reusable, distributable packages for other teams, or when complex logic (conditionals, dynamic loops) is needed.
- **Use Kustomize** when managing environment variations within a single Git repository without wanting template syntax errors, or when tweaking third-party vendor manifests.

---

## 🐙 GitOps moves reconciliation from your terminal into the cluster

In earlier stages, you ran `kubectl` or Helm and then inspected the result.
GitOps keeps the desired configuration in Git and gives a controller the job of
performing the same desired-versus-observed comparison continuously. This is the
same reconciliation idea from ReplicaSets at a larger scope: compare, report
drift, and—when configured—act.

Instead of human engineers running `helm install` or `kubectl apply` from their laptops, an in-cluster controller (**Argo CD**) continuously synchronizes the live cluster with Git:

```
┌────────────────────────────────────────────────────────┐
│ ARGO CD RECONCILIATION LOOP                            │
│                                                        │
│  1. READ Git Commit (helm/apollo11 + values-prod.yaml) │
│  2. READ Live Cluster State (via kube-apiserver)       │
│  3. COMPARE Desired vs Observed State                  │
│     ├── If identical  ──► Status: Synced & Healthy     │
│     └── If different  ──► Status: OutOfSync            │
│                            │                           │
│     ┌──────────────────────┘                           │
│     ▼                                                  │
│  4. SELF-HEAL / PRUNE                                  │
│     Overwrites rogue manual kubectl changes and        │
│     deletes orphaned cluster resources!                │
└────────────────────────────────────────────────────────┘
```

In `stages/stage5/argocd/`, Apollo11 defines separate Argo CD Applications.
Dev and staging enable automated sync and self-heal with a documented drift
window of up to three minutes; prod intentionally requires manual sync. A
deletion in a self-healing environment is reconciled, but the same claim must
not be made for prod.

---

## 🧪 Investigations: inspect the generated request before trusting the tool

Package tooling can make a large application feel like one command. Keep asking
what that command generated, which revision it recorded, and whether a later
controller is authorised to change live state.

### Exercise 1: Local Template Rendering with Helm

**Prediction:** rendering changes files in `/tmp`, not the cluster. The booking
Deployment in each rendered file should reveal exactly how a values file affects
the desired replica count.

- **Objective**: Inspect the rendered Kubernetes YAML generated by Helm without applying it to the cluster.
- **Starting Point**: Terminal in the Apollo11 repository.
- **Instructions**:

```bash
cd Apollo11

# 1. Lint the chart to catch syntax or schema errors
helm lint stages/stage5/helm/apollo11

# 2. Render the dev environment manifests to stdout
helm template apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml > /tmp/rendered-dev.yaml

# 3. Check rendered replicas for booking
grep -A 10 "name: booking" /tmp/rendered-dev.yaml | grep "replicas:"
# Output: replicas: 1

# 4. Render the prod environment manifests
helm template apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-prod.yaml > /tmp/rendered-prod.yaml

# Check rendered replicas for prod
grep -A 10 "name: booking" /tmp/rendered-prod.yaml | grep "replicas:"
# Output: replicas: 3
```

- **What Concept This Reinforces**:
  `helm template` is client-side rendering. It lets you inspect every generated line of YAML before it ever touches the API server.
- **Expected result**: Both renders succeed; booking is 1 replica in dev and 3
  in prod.
- **Verification command**: `helm lint` exits zero and the two grep commands
  show their environment-specific counts.
- **Troubleshooting hints**: If grep is ambiguous, inspect the rendered
  Deployment by kind/name with a YAML-aware tool; text proximity is only a
  convenient lab check.

---

### Exercise 2: Deploying Apollo Airlines with Helm

**Prediction:** the API server receives normal Kubernetes objects, while Helm
adds a release history that `kubectl apply` alone would not create. Inspect both
the Deployment and `helm history` to see the difference.

- **Objective**: Install Apollo Airlines as a Helm release and inspect its revision history.
- **Starting Point**: Running `kind-apollo11` cluster.
- **Instructions**:

```bash
# 1. Run the verified Stage 5 apply script in Helm mode
bash stages/stage5/scripts/apply.sh --mode helm --env dev

# 2. Inspect Helm release list
helm list -A

# 3. Check release revision history
helm history apollo11 -n apollo-airlines-apps
```

- **Expected Result**:
  `helm list` shows `apollo11` with `STATUS: deployed` at revision `1`.
  All 10 workloads, 2 namespaces, Gateway, and MetalLB resources are active!
- **Verification command**: `bash stages/stage5/scripts/verify.sh --mode helm`
  runs the Helm-path contract.
- **Troubleshooting hints**: If the release is `failed` or `pending-*`, inspect
  `helm status`, release history, Pod events, and hook Jobs before retrying.
- **Concept reinforced**: Helm stores a release revision that groups many
  rendered Kubernetes resources into one upgrade/rollback unit.

---

### Exercise 3: Upgrades and Rollbacks

**Prediction:** rollback does not travel back in time or undo unrelated objects.
It renders and applies the selected recorded release configuration as a new
revision, then the Deployment controller carries out the resulting replica
change.

- **Objective**: Upgrade the Helm release, inspect its revision history, and
  roll back to a known prior revision.
- **Starting Point**: Healthy Helm release from Exercise 2.
- **Instructions**:

```bash
# 1. Upgrade the release to scale booking to 4 replicas
helm upgrade apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml \
  --set apps.booking.replicas=4 \
  -n apollo-airlines-apps

# Verify booking now has 4 pods:
kubectl get deployment booking -n apollo-airlines-apps

# 2. Inspect history (now revision 2!)
helm history apollo11 -n apollo-airlines-apps

# 3. Roll back to revision 1
helm rollback apollo11 1 -n apollo-airlines-apps

# 4. Confirm booking scaled back down to 1 replica
kubectl get deployment booking -n apollo-airlines-apps
```

- **Expected Result**: Helm creates an upgrade revision and then a rollback
  revision. The booking Deployment returns to the replica count stored in the
  selected prior release revision; unrelated releases are unchanged.
- **Verification command**: Wait for `deployment/booking` rollout completion and
  confirm one Ready replica after rollback.
- **Troubleshooting hints**: Revision numbers are release-specific. Read `helm
  history` and roll back to the actual prior good revision rather than assuming
  it is always `1` in a reused cluster.
- **Concept reinforced**: Rollback creates a new release revision from stored
  prior configuration; it does not rewind unrelated cluster state.

---

### Exercise 4: Kustomize Inspection

**Prediction:** the overlay changes the rendered object graph without creating
a Helm release. Compare the label and image in its output with the base rather
than treating Kustomize as a second deployment controller.

- **Objective**: Render and inspect Kustomize overlays.
- **Starting Point**: Stage 5 directory.
- **Instructions**:

```bash
# Render dev overlay using kubectl's built-in kustomize engine
kubectl kustomize stages/stage5/overlays/dev > /tmp/kustomize-dev.yaml

# Verify image tags and replicas
grep -B 2 -A 5 "image: apollo11/booking:latest" /tmp/kustomize-dev.yaml
```

Notice that Kustomize injected `labels: environment: dev` into all resources without needing a single Go template curly brace!

- **Expected result**: Rendering succeeds, the booking image uses `latest`, and
  environment labels appear in the output.
- **Verification command**: `kubectl kustomize stages/stage5/overlays/dev >/dev/null`
  exits zero without mutating the cluster.
- **Troubleshooting hints**: Inspect `overlays/dev/kustomization.yaml` and its
  referenced base if a resource or patch cannot be resolved.
- **Concept reinforced**: Kustomize composes and patches Kubernetes objects;
  Helm evaluates templates and records releases.

---

## 🏁 What You Learned

- How Helm packages multi-service architectures into reusable, parameterizable charts.
- How Go templating, conditionals, and `nindent` generate valid Kubernetes YAML.
- How multi-environment values files (`dev`, `staging`, `prod`) eliminate code duplication.
- How Kustomize provides a template-free patching alternative to Helm.
- How Helm tracks release revisions and enables atomic one-command rollbacks.
- How GitOps and Argo CD ensure that cluster state continuously reconciles with Git.

---

## ✈️ Before Continuing: Checkpoint

Before moving to Stage 6, test your understanding:
1. Why is `nindent 8` used instead of `indent 8` when embedding labels into a Pod template?
2. If you pass two values files (`-f values.yaml -f values-prod.yaml`), which one wins if a key is defined in both?
3. How does `helm rollback` know what configuration existed in an earlier revision?
4. What happens when an engineer manually deletes a Pod in an Argo CD-managed cluster with self-healing enabled?

Now that Apollo Airlines is packaged and deployable across any environment, let's turn on full observability: metrics, distributed tracing, and centralized logging!

👉 **Continue to [Stage 6: Mission Operations (Observability & Tracing)](./stage-6)**
