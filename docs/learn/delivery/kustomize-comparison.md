---
title: "Kustomize and overlays"
description: "Understand how Kustomize transforms a base object graph through overlays, how it compares to Helm's templating model, and what each approach is better suited for."
---

# Kustomize and overlays

*Stage 5 · Payload Integration*

Unlike Helm, which interpolates placeholders into template strings, **Kustomize** operates without templates. It starts with valid, standalone Kubernetes YAML as a base and merges environment-specific transformations through overlays.

---

## The Base and Overlay pattern

~~~mermaid
flowchart TD
  Base["base/booking-dep.yaml\nreplicas: 1\nimage: apollo11/booking:latest"] --> KustEngine["kustomize build overlays/prod"]
  Overlay["overlays/prod/kustomization.yaml\n+ replica-patch: replicas: 3\n+ image tag: v1.2.0"] --> KustEngine
  KustEngine --> Result["Rendered output:\nreplicas: 3\nimage: apollo11/booking:v1.2.0"]
  Result --> APIServer["kubectl apply -k overlays/prod"]
~~~

*Diagram DL-02 — Kustomize merges the base manifests and overlay patches into pure YAML for the cluster.*

- **The Base**: Contains the standard resource graph that can be directly applied without modification.
- **The Overlays**: Target specific environments (e.g. `overlays/prod/`):
  - Injects environment-specific replica counts.
  - Updates container image tags.
  - Adds common labels and namespace prefixes.

---

## Helm vs. Kustomize comparison

| Architectural Aspect | Helm | Kustomize |
|---|---|---|
| **Underlying model** | Parameterized Go text templates | Pure YAML patch transformations |
| **Base validity** | Chart templates are invalid standalone YAML | Base files are valid, runnable Kubernetes objects |
| **Release tracking** | Built-in release state (`helm history`) | Relies on Git commits and GitOps controllers |
| **Learning curve** | Higher (Go syntax, Sprig functions) | Lower (native Kubernetes patch syntax) |
| **Ideal use case** | Reusable third-party packages | In-house microservice environment overlays |

---

## Evidence and limits

- **1. Build overlay preview**: Inspect merged YAML locally:
  ```bash
  kubectl kustomize overlays/prod
  ```
- **2. Live cluster diff**: Check pending modifications before applying:
  ```bash
  kubectl diff -k overlays/prod -n apollo-airlines-apps
  ```
- **3. Apply overlay**:
  ```bash
  kubectl apply -k overlays/prod -n apollo-airlines-apps
  ```
