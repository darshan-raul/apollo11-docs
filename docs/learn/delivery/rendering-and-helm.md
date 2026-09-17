---
title: "Rendering and Helm"
description: "Understand how Helm turns templates and values into the Kubernetes objects a cluster receives, what a release record is, and why reading rendered output before applying is an essential habit."
---

# Rendering and Helm

*Stage 5 · Payload Integration*

Managing duplicate Kubernetes YAML manifests across development, staging, and production environments leads to inevitable configuration drift. 

**Helm** packages Kubernetes manifests into reusable charts, separating common structural templates from environment-specific configuration values.

---

## Two outputs of a Helm operation

~~~mermaid
flowchart LR
  Chart["Chart.yaml\n(name, version, dependencies)"] --> Helm
  Templates["templates/booking-dep.yaml\n{{ .Values.image.tag }}\n{{ .Values.replicas }}"] --> Helm
  ValDev["values-dev.yaml\nimage.tag: latest\nreplicas: 1"] --> Helm
  ValProd["values-prod.yaml\nimage.tag: v1.2.0\nreplicas: 3"] --> Helm
  Helm["Helm engine\nhelm install / upgrade"] --> RenderOutput["Rendered YAML\n(ordinary Kubernetes objects)"]
  Helm --> ReleaseRecord["Release record\n(stored in Secret in the cluster)\nRevision: 3\nStatus: deployed"]
  RenderOutput --> APIServer["kube-apiserver\n(receives the rendered objects)"]
~~~

*Diagram DL-01 — Helm renders plain Kubernetes YAML for the API server and stores revision metadata in a cluster Secret.*

When running `helm install` or `helm upgrade`, Helm produces two distinct artifacts:
- **1. Rendered Kubernetes manifests**: Standard YAML definitions (Deployments, Services, ConfigMaps). The Kubernetes API server accepts these objects without knowing Helm rendered them.
- **2. Release record**: A compressed, base64-encoded Secret stored in the application namespace tracking release history, chart versions, and values for rollback auditing.

---

## The discipline of dry-run rendering

Chart templates can generate unexpected YAML through misconfigured indentation or conditional evaluation. Always render and inspect manifests locally before applying to a live cluster:

- **Render templates locally**:
  ```bash
  helm template apollo-dev ./stages/stage5/helm/apollo11 \
    -f ./stages/stage5/helm/apollo11/values-dev.yaml
  ```
- **Audit image tags in output**:
  ```bash
  helm template apollo-dev ./stages/stage5/helm/apollo11 \
    -f ./stages/stage5/helm/apollo11/values-dev.yaml | grep "image:"
  ```

---

## Core template mechanics

- **Value substitution**: Injecting values dynamically from values files:
  ```yaml
  replicas: {{ .Values.replicas }}
  ```
- **Conditional inclusion**: Enabling objects only in production environments:
  ```yaml
  {{- if .Values.pdb.enabled }}
  apiVersion: policy/v1
  kind: PodDisruptionBudget
  {{- end }}
  ```
- **Whitespace control (`nindent`)**: Ensures multiline blocks format with valid YAML indentation:
  ```yaml
  resources:
    {{- toYaml .Values.resources | nindent 4 }}
  ```

---

## Evidence and limits

- **1. Template validation**: Confirm templates render without syntax errors:
  ```bash
  helm lint ./stages/stage5/helm/apollo11
  ```
- **2. Release revision history**: Inspect deployed release versions:
  ```bash
  helm history apollo-airlines -n apollo-airlines-apps
  ```
- **3. Active release status**:
  ```bash
  helm status apollo-airlines -n apollo-airlines-apps
  ```
- **4. Rollback execution**: Revert to a known good revision:
  ```bash
  helm rollback apollo-airlines 2 -n apollo-airlines-apps
  ```
