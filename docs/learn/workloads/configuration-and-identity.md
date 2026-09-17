---
title: "Configuration and identity"
description: "Separate application values from container images, understand how Pods consume ConfigMaps and Secrets, and restrict Kubernetes API access with ServiceAccounts."
---

# Configuration and identity

*Stage 1 · Liftoff*

The booking container image is a single artifact. It runs across distinct environments:
- **Development**: local database passwords, debug logging, local mocks.
- **Staging**: staging endpoints and shared test credentials.
- **Production**: restricted credentials that no developer should ever see in a shell prompt.

Baking these values directly into the container image couples a single deployment artifact to one environment. Conversely, putting every value inline in the Deployment template makes cross-service relationships difficult to audit.

Kubernetes separates configuration from the workload through three dedicated primitives:
- **`ConfigMap`**: stores non-sensitive configuration keys and environment flags.
- **`Secret`**: stores sensitive credentials, tokens, and certificates.
- **`ServiceAccount`**: provides the workload identity for talking to the Kubernetes API.

---

## ConfigMaps hold non-sensitive values

A **ConfigMap** is an API object storing string key-value pairs. Apollo uses `apollo-airlines-config` to distribute port numbers, service URLs, and database names across all ten microservices:

- **Centralized values**: When `BOOKING_SERVICE_URL` or `PORT_BOOKING` changes, updating one ConfigMap reaches all dependent consumers.
- **Environment independence**: Container binaries remain immutable while configuration shifts per cluster or namespace.

A Pod consumes a ConfigMap in two distinct ways:

- **Environment variables (`valueFrom.configMapKeyRef`)**:
  - Values are injected at container startup.
  - The application reads standard OS environment variables.
  - *Caveat*: Updating the ConfigMap does **not** restart the container or dynamically refresh the running process's memory. A new Pod or rollout is required to pick up changes.
- **Mounted volume files (`volumes[].configMap`)**:
  - The ConfigMap keys are projected as files inside a mounted directory.
  - File changes reflect in the filesystem asynchronously.
  - *Caveat*: Reloading the new file content requires explicit application support (such as listening for `SIGHUP` or watching file system events); Kubernetes does not signal the process.

~~~mermaid
flowchart LR
  CM["ConfigMap: apollo-airlines-config\nFLIGHT_SERVICE_URL=http://flight:8081\nPORT_BOOKING=8082"] -->|valueFrom.configMapKeyRef| ENV["booking container\nenv: FLIGHT_SERVICE_URL, PORT_BOOKING"]
  SEC["Secret: apollo-airlines-secrets\nJWT_SECRET=<encoded>"] -->|valueFrom.secretKeyRef| ENV
  SA["ServiceAccount: booking\nautomountServiceAccountToken: false"] -->|spec.serviceAccountName| POD["booking Pod"]
~~~

*Diagram WL-04 — ConfigMaps, Secrets, and ServiceAccounts each reach the Pod through a different field and carry independent limits.*

---

## Secrets hold sensitive values — with critical caveats

A **Secret** carries values treated as sensitive: passwords, tokens, and TLS keys. The API stores them separately from ConfigMaps so RBAC can restrict access more strictly.

However, in default Kubernetes cluster configurations:
- **Base64 is not encryption**: Secrets in etcd are stored as base64-encoded plain strings, not encrypted ciphertext. Anyone with etcd read access or namespace read permissions can decode them instantly (`echo <secret> | base64 -d`).
- **No automatic encryption at rest**: Etcd encryption-at-rest or external KMS integration (covered in Stage 8) must be explicitly enabled.
- **No automatic rotation**: Stored Secret objects do not expire or rotate credentials automatically.
- **No leak prevention**: Application runtimes can still accidentally print `JWT_SECRET` to stdout or trace logs.

> **Key takeaway**: Use Secrets instead of ConfigMaps for sensitive values to enable tighter RBAC controls, but do not assume using a Secret object automatically encrypts or protects the data.

---

## ServiceAccounts identify the workload to the API

Every Pod runs under an assigned **ServiceAccount**. By default, Kubernetes mounts an API token for that account into `/var/run/secrets/kubernetes.io/serviceaccount/token`, permitting processes inside the container to query the Kubernetes API.

For Apollo's microservices:
- **No API privileges needed**: Services like `booking` or `flight` need databases and peer HTTP endpoints; they never need to create Pods or inspect cluster Secrets.
- **Defensive posture**: Exposing an API credential to a web-facing service increases the blast radius if the application container is compromised.
- **Disabled token mounts**: Stage 1 declares dedicated ServiceAccounts with automounting explicitly disabled:

~~~yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: booking
  namespace: apollo-airlines
automountServiceAccountToken: false
~~~

The ServiceAccount remains a formal identity for future RBAC policies, but prevents unauthorized container processes from contacting the control plane.

---

## Labels are selection metadata, not identity

Do not confuse selector labels with security identities:

- **Labels (`metadata.labels`)**:
  - Arbitrary, mutable key-value metadata.
  - Used by ReplicaSets to count copies and by Services to route traffic.
  - Provide no security boundary or access credentials.
- **ServiceAccounts (`spec.serviceAccountName`)**:
  - Cryptographically verifiable identities managed by the Kubernetes control plane.
  - Bound to RBAC roles and permissions.

| Concept | Set by | Purpose & Consumer |
|---|---|---|
| **Label `app: booking`** | `metadata.labels` in template | Discovered by Service and ReplicaSet selectors |
| **ServiceAccount `booking`** | `spec.serviceAccountName` | Evaluated by API server RBAC authorizers |

---

## Evidence and limits

When configuration fails, processes rarely fail with obvious errors. Verify each link in the chain systematically:

- **1. Object validation**: Confirm the ConfigMap or Secret exists and contains the expected key:
  ```bash
  kubectl describe configmap apollo-airlines-config -n apollo-airlines
  ```
- **2. Reference integrity**: Ensure the Deployment's `valueFrom` references the exact key name and secret name without typos.
- **3. Startup timing**: Check if the Pod started before the ConfigMap was applied (causing environment variables to remain empty or stale).
- **4. Runtime verification**: Inspect what the process actually received inside the container:
  ```bash
  kubectl exec -n apollo-airlines deploy/booking -- env | grep -E "PORT|URL"
  ```
- **5. Token mount verification**: Ensure no unexpected tokens are mounted:
  ```bash
  kubectl exec -n apollo-airlines deploy/booking -- ls -la /var/run/secrets/kubernetes.io/serviceaccount
  ```
