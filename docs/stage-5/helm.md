---
title: "Helm — Chart Packaging"
description: "Package and version Kubernetes manifests using Helm charts with Go templates."
---

# Helm — Chart Packaging

Helm is the package manager for Kubernetes. Charts package complete application stacks as versioned, templated manifests.

---

## Chart Structure

```
mychart/
├── Chart.yaml          # Chart metadata (name, version, dependencies)
├── values.yaml          # Default configuration values
├── values.schema.json   # (optional) Validation schema
├── charts/              # Subcharts (embedded dependency charts)
└── templates/           # Kubernetes manifests (Go templates)
    ├── deployment.yaml
    ├── service.yaml
    └── _helpers.tpl     # Named templates (reusable template functions)
```

---

## Chart.yaml

```yaml
apiVersion: v2
name: apollo11
description: Apollo11 application chart
type: application
version: 0.1.0
appVersion: "1.0.0"

dependencies:           # (v2 only) Chart dependencies
  - name: postgresql
    version: "12.x.x"
    repository: "https://charts.bitnami.com/bitnami"
```

---

## values.yaml

```yaml
replicaCount: 2

image:
  repository: ghcr.io/darshan-raul/apollo11
  pullPolicy: IfNotPresent
  tag: "1.0.0"

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  className: traefik
  host: api.apollo11.local

resources:
  limits:
    cpu: 500m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

---

## templates/

Files in `templates/` are Go templates that can reference values:

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-{{ .Chart.Name }}
  labels:
    app: {{ .Chart.Name }}
    version: {{ .Values.image.tag }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app: {{ .Chart.Name }}
    spec:
      containers:
        - name: app
          image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
          ports:
            - containerPort: {{ .Values.service.port }}
          resources: {{ .Values.resources }}
```

---

## Built-in Objects

| Object | Description |
|--------|-------------|
| `.Release.Name` | Release name (e.g., `my-apollo11`) |
| `.Release.Namespace` | Target namespace |
| `.Release.Revision` | Revision number (1, 2, 3...) |
| `.Chart.Name` | Chart name |
| `.Chart.Version` | Chart version |
| `.Values` | User-supplied values |
| `.Values.image.tag` | Access nested values |

---

## Helm Commands

```bash
# Install
helm install <release> <chart> -n <namespace>
helm install apollo11 ./chart -n apollo11-apps

# Upgrade
helm upgrade <release> <chart> -n <namespace>
helm upgrade apollo11 ./chart -f values.prod.yaml

# Rollback
helm rollback <release> -n <namespace>
helm rollback apollo11 1  # Rollback to revision 1

# Template (dry-run without installing)
helm template <release> <chart> -f values.yaml

# List and inspect
helm list -n apollo11-apps
helm get values apollo11 -n apollo11-apps
```

---

## Named Templates (_helpers.tpl)

```yaml
# templates/_helpers.tpl
{{- define "apollo11.labels" }}
app: {{ .Chart.Name }}
version: {{ .Chart.Version }}
{{- end }}
```

Reference in templates:

```yaml
metadata:
  labels:
    {{- include "apollo11.labels" . | nindent 4 }}
```

---

## Key Takeaways

```
Chart structure:
  Chart.yaml      - metadata, dependencies
  values.yaml     - default configuration
  templates/      - Go templated manifests

Built-in objects:
  .Release.Name   - release name
  .Values         - user values
  .Chart.Name     - chart name

Commands:
  helm install    - install a chart
  helm upgrade    - upgrade a release
  helm rollback   - rollback to previous revision
  helm template   - render without installing
```