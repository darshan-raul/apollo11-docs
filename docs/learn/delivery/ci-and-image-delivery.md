---
title: "CI and image delivery"
description: "Trace the complete path from a source code commit to a running Pod: what each CI step proves, how an image digest differs from a tag, and how to connect an artifact back to the code that produced it."
---

# CI and image delivery

*Stage 5 · Payload Integration*

When an engineer asks "Is commit `abc1234` currently running in production?", the answer requires tracing an unbroken lineage from git history through container registries to running Pod specifications.

---

## The delivery pipeline handoffs

~~~mermaid
flowchart LR
  Commit["Git commit\n(source revision: abc1234)"] -->|triggers| CI["CI pipeline\n(GitHub Actions / GitLab CI)"]
  CI -->|runs| Tests["Unit tests\nLint / type check\nContainer build"]
  CI -->|pushes| Registry["Container registry\nimage: apollo11/booking:abc1234\ndigest: sha256:..."]
  Registry -->|referenced by| Manifest["Deployment manifest\nimage: apollo11/booking:abc1234"]
  Manifest -->|applied by| Cluster["kube-apiserver\nnew Deployment revision"]
  Cluster -->|kubelet pulls| Pod["booking Pod\nrunning sha256:..."]
~~~

*Diagram DL-05 — four sequential handoffs: commit triggers CI, CI builds and pushes image, manifest references image, kubelet pulls and runs container.*

- **1. Source revision**: Commit SHA guarantees the code snapshot tested.
- **2. Artifact build**: Container image compiled and pushed to registry.
- **3. Manifest reference**: Deployment updated to reference the new image artifact.
- **4. Runtime execution**: Kubelet pulls the image digest and launches the container.

---

## Mutable tags vs. Immutable digests

- **Image tags (e.g. `:v1.2.0` or `:latest`)**:
  - Mutable pointers. Registries allow overwriting the same tag with a new binary.
  - Nodes with cached images (`imagePullPolicy: IfNotPresent`) might run stale code despite tag updates.
- **Image digests (e.g. `@sha256:e3b0c44...`)**:
  - Cryptographically immutable hash of image content.
  - Guarantees every node runs the exact binary compiled by CI.

---

## Evidence and limits

- **1. Identify image running in Pod**:
  ```bash
  kubectl get pod -l app=booking -n apollo-airlines-apps \
    -o jsonpath='{.items[0].spec.containers[0].image}'
  ```
- **2. Verify exact pulled digest**:
  ```bash
  kubectl get pod -l app=booking -n apollo-airlines-apps \
    -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'
  ```
- **3. Audit Git commit provenance**: Verify the container image short-SHA corresponds to an approved commit in git history.
