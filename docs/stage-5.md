---
title: Stage 5 — Payload Integration
description: Package, customize, test, and reconcile Apollo Airlines with Helm, Kustomize, CI, and Argo CD.
---

# Stage 5 — Payload Integration

Stage 5 turns a working cluster into a repeatable delivery system. Helm is the canonical packaging path; Kustomize is the template-free comparison; GitHub Actions builds and validates images; Argo CD reconciles Git state.

## Concepts: packaging and desired state

Helm is a package and release manager. `Chart.yaml` identifies the package, `values.yaml` supplies inputs, and templates render Kubernetes objects. The release stores revision history, which is why `helm rollback` can select an earlier rendered revision. `helm template` only renders locally; it does not prove the API server will accept or successfully run the objects.

Kustomize composes a base with overlays and patches. It does not template arbitrary strings, but patches still have exact targets and paths. Rendered YAML is the truth to inspect. A patch matching nothing or a wrong image name can leave the output unchanged.

GitOps makes Git the desired-state source. Argo CD renders Git, compares it with live objects, reports drift, and optionally syncs. Automated sync, prune, and self-heal are separate policies. A manual production Application remaining `OutOfSync` is an intentional approval boundary.

### Read a Helm template as a program

Helm templates are Go-template programs that produce YAML. A value such as `.Values.apps.booking.replicas` is input; an `if` decides whether an object exists; a helper centralizes names and labels; `toYaml` serializes a nested map with indentation. The chart is not the object that Kubernetes runs—the rendered output is.

```yaml
spec:
  replicas: {{ .Values.apps.booking.replicas }}
  template:
    metadata:
      labels:
        {{- include "apollo11.labels" . | nindent 8 }}
```

Whitespace controls the generated document. `{{-` trims preceding whitespace and `nindent` adds a newline plus indentation. A template can render successfully while producing a wrong selector, wrong namespace, or wrong type, so inspect the output with `helm template` and then validate it against the cluster API.

Values merge from chart defaults, selected values files, and command-line overrides. Nested maps are usually merged by key; lists and scalar values are commonly replaced. A `--set apps.booking.replicas=3` override may be useful for a one-off experiment but is invisible to reviewers unless recorded. Production values pin image tags because `latest` is a moving pointer, not a release identity.

### Read a Kustomize overlay as a transformation

Kustomize starts with resources in a base, then applies name transformations, common metadata, image changes, and patches. The base should contain the shared contract; an overlay should contain only environment differences. A patch target identifies an existing resource, and the patch path must exist with the expected type.

```yaml
resources:
  - ../base
patches:
  - target:
      kind: Deployment
      name: booking
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1
images:
  - name: apollo11/booking
    newTag: latest
```

The rendered result is the contract. `kubectl kustomize overlays/dev` is therefore the Kustomize equivalent of `helm template`. Do not review only the patch: review the final Deployment, image, namespace, selector, and generated resources.

### GitOps ownership and drift

An Argo CD Application has a source (repository, revision, path, and renderer), a destination (cluster and namespace), and a sync policy. The controller repeatedly compares rendered desired objects with live objects. `OutOfSync` is a comparison result, not automatically a failure. `Healthy` is a resource health assessment, not a statement that desired and live state match.

Prune removes resources that disappeared from the source. Self-heal reapplies desired state after an out-of-band mutation. An AppProject restricts what an Application may deploy and where it may deploy. Those boundaries prevent one tenant Application from silently owning cluster-wide infrastructure.

## Helm: values are inputs, templates are functions

```bash
helm lint stages/stage5/helm/apollo11
helm template apollo11 stages/stage5/helm/apollo11 -f stages/stage5/helm/apollo11/values-dev.yaml > /tmp/apollo-dev.yaml
helm install apollo11 stages/stage5/helm/apollo11 -f stages/stage5/helm/apollo11/values-dev.yaml
helm history apollo11
```

`Chart.yaml` identifies the package. `values.yaml` supplies defaults. `values-*.yaml` override environment choices. Templates render Kubernetes objects. Later `-f` files and `--set` override earlier values; `--set` is easy to mistype and difficult to review, so use checked-in files for durable environment policy.

### A disciplined Helm reading exercise

Pick Booking and trace it through the chart in this order:

1. Find `apps.booking` in `values.yaml` and each environment file.
2. Find the template that reads that value.
3. Render the chart for dev and prod.
4. Compare image repository/tag, replicas, resources, PDB settings, and namespace.
5. Confirm that the Service selector still matches the rendered Deployment labels.

```bash
helm show values stages/stage5/helm/apollo11
helm template apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml \
  --debug > /tmp/apollo-dev.yaml
grep -n -A35 -B5 'name: booking' /tmp/apollo-dev.yaml
```

The rendered document contains `---` separators because one chart produces many API objects. Search by `kind`, `metadata.name`, and labels rather than reading it only from top to bottom. If a conditional disables PDBs or observability, the absence of a resource is part of the environment contract.

### Values are an API

Treat chart values like a public function signature. Renaming `apps.booking.replicas`, changing a default, or changing a value from a map to a scalar can break every environment file and every GitOps Application. Schema validation can constrain types and required keys, but it cannot tell you that three replicas exceed your local cluster capacity or that a production image tag does not exist.

Avoid putting secrets directly into committed values. Prefer a secret reference or external secret mechanism when the security stage supports it. Avoid using `latest` as a production identity because two syncs of the same Git revision can pull different image bytes.

Gotchas: YAML indentation changes data types; a quoted value is a string; `helm template` proves rendering, not API acceptance; `helm install --dry-run` can expose rendered Secrets in terminal output; and a chart release has history, while raw Kustomize does not.

## Kustomize: patches preserve YAML shape

```bash
kubectl kustomize stages/stage5/overlays/dev > /tmp/apollo-kustomize.yaml
kubectl apply -k stages/stage5/overlays/dev
```

The base contains common resources; overlays select patches and image transformations. A JSON6902 patch path is exact. A target selector that matches no resource can silently fail to express the intent you thought it did, so inspect the rendered output.

### Base versus overlay responsibility

The base should answer “what is Apollo Airlines?”—workload names, ports, selectors, common configuration, and shared security defaults. An overlay should answer “how does this environment differ?”—replica count, image registry/tag, PDB policy, and resource sizing. If every overlay copies the entire Deployment, the system has three independent manifests and drift becomes hard to see. If the base contains production-only values, dev becomes dangerous or expensive.

```bash
kubectl kustomize stages/stage5/overlays/dev > /tmp/dev.yaml
kubectl kustomize stages/stage5/overlays/prod > /tmp/prod.yaml
diff -u /tmp/dev.yaml /tmp/prod.yaml | less
```

Review the diff for intended differences only. A namespace change, selector change, or missing Secret is usually a composition bug rather than a desired environment distinction.

| Helm | Kustomize |
| --- | --- |
| Template/package/release history | Base/overlay/ordinary YAML |
| Strong for reusable distributions | Strong for environment deltas |
| `helm rollback` | Git revert + re-apply |

## CI and GitOps

Inspect `.github/workflows/main.yml` and understand its gates: build images, run checks, and publish only when the workflow's conditions allow it. GHCR image tags are an artifact identity; production values pin a tag rather than relying on `latest`.

The Argo CD module lives at `stages/stage5/argocd/` and owns three environment Applications. Dev and staging automate sync, prune, and self-heal; prod is manual. The AppProject limits destinations and denies Application-owned cluster-scoped resources. The observability Application is introduced in Stage 6.

### CI is not deployment

Continuous integration proves an artifact can be built, tested, scanned, and published. Continuous delivery changes an environment. GitOps separates these concerns: CI publishes an immutable image and updates the desired configuration; Argo CD notices the Git revision and performs the cluster-side reconciliation. A green image build does not prove the cluster is healthy. A Synced Application does not prove the user journey works.

The useful artifact chain is:

```text
source commit → image digest → registry → values/manifest revision → rendered objects → live health → user behavior
```

At every boundary, ask what identity is being carried forward. A mutable tag breaks the image-to-deployment link. A missing Git revision breaks the desired-to-live link. A health check that only checks Pod existence breaks the live-to-behavior link.

### Argo CD resource ownership

Argo CD can manage namespaced resources and, if permitted, cluster-scoped resources. The Apollo Project limits what Applications may own so the tenant chart cannot accidentally manage CRDs, GatewayClasses, or observability infrastructure. Shared components are installed once by a platform-owned Application. If two Applications render the same object, whichever reconciles last can overwrite the other, producing an ownership fight rather than a stable platform.

An Application can be `Synced` but `Progressing`, meaning desired object versions match while Pods are still becoming ready. It can be `OutOfSync` but `Healthy`, meaning live resources work while a manual edit differs from Git. Learn to read sync status and health status as separate dimensions.

```bash
bash stages/stage5/argocd/scripts/validate.sh
bash stages/stage5/argocd/install.sh --offline
bash stages/stage5/argocd/scripts/bootstrap.sh --sync
kubectl get applications -n argocd
bash stages/stage5/argocd/scripts/verify.sh
```

## Break and recover

Imperatively scale a dev Deployment or edit a rendered object. Argo CD should show `OutOfSync` and self-heal it. For prod, the same drift should remain until a human syncs it. Recover by changing Git/YAML through the intended path or invoking the documented sync; do not “fix” GitOps drift only with `kubectl`.

```bash
kubectl scale deployment booking -n apollo-airlines-dev-apps --replicas=5
kubectl get applications -n argocd -w
kubectl get deployment booking -n apollo-airlines-dev-apps

Now repeat the thought experiment for production. The prod Application should remain out of sync until a deliberate sync operation. That difference is the purpose of the policy, not a defect in the controller.

## Stage 5 checkpoint questions

1. What is the difference between chart input, rendered YAML, and live state?
2. Why can `helm template` succeed while `kubectl apply` or the workload fails?
3. When should a value live in a values file, a Secret reference, or the image itself?
4. What does a Kustomize overlay change, and what should remain in the base?
5. Which system owns replicas in your current experiment: Helm, Kustomize, Argo CD, HPA, or a human?
6. What does `OutOfSync` mean when the application is still `Healthy`?
7. Why must shared CRDs, GatewayClasses, and observability resources have one clear owner?
```

Continue to [Stage 6](./stage-6).
