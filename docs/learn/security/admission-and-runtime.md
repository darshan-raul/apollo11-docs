---
title: "Admission and runtime controls"
description: "Understand the difference between pre-admission policy evaluation and post-startup runtime controls, and why a compliant manifest cannot guarantee secure container behavior."
---

# Admission and runtime controls

*Stage 8 · Command Module (Planned Roadmap)*

:::note[Conceptual chapter]
Apollo does not yet provide a runnable Stage 8 security environment. The
manifests and commands below illustrate a future implementation; they are not
steps in the supported Stage 7 lab.
:::

A secure container image declared in YAML can still be exploited at runtime if the container runs as root, mounts a writable root filesystem, or retains unnecessary Linux kernel capabilities. 

Kubernetes secures workloads across two separate enforcement boundaries: **pre-admission** (before objects are saved to etcd) and **runtime sandboxing** (after containers start).

---

## Pre-admission vs. Runtime enforcement

~~~mermaid
flowchart LR
  YAML["Pod Manifest\n(submitted by user/CI)"] --> Webhook["Admission Webhook\n(Kyverno / OPA Gatekeeper)"]
  Webhook -->|Validates / Mutates| APIServer["kube-apiserver\n(committed to etcd)"]
  APIServer --> Kubelet["Kubelet on Node"]
  Kubelet --> Runtime["Runtime Sandbox\n- Linux Capabilities\n- readOnlyRootFilesystem\n- runAsNonRoot\n- seccomp profile"]
~~~

*Diagram SEC-01 — admission controls gate the API server, while runtime isolation parameters govern the Linux kernel sandbox.*

- **1. Admission Controls (Pre-Persistence)**:
  - Validating and mutating webhooks (e.g. Kyverno, OPA Gatekeeper).
  - Evaluates objects *before* persistence in etcd.
  - Rejects non-compliant declarations (e.g. blocking images from untrusted public registries).
- **2. Runtime Sandboxing (Post-Startup)**:
  - Enforced by container runtimes (containerd, CRI-O) via kernel cgroups and namespaces.
  - Constrains process capabilities even if application code is breached.

---

## The four core Pod security parameters

Stage 8's planned hardening baseline requires four explicit runtime controls:

- **`runAsNonRoot: true`**:
  - Prevents the container process from running with UID `0`.
  - Blocks container-breakout attacks that rely on root filesystem privileges.
- **`readOnlyRootFilesystem: true`**:
  - Sets the root container image layers to read-only.
  - Attackers cannot download toolkits (`curl | sh`), install malware, or overwrite binaries.
  - Applications write temporary files strictly to dedicated in-memory `emptyDir` scratch volumes.
- **`capabilities.drop: ["ALL"]`**:
  - Strips default Linux kernel privileges (such as `CAP_NET_RAW`, `CAP_SYS_ADMIN`).
  - Restricts processes to bare unprivileged execution.
- **`seccompProfile.type: RuntimeDefault`**:
  - Filters and restricts kernel system calls (syscalls) available to the container.

~~~yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault
~~~

---

## Evidence and limits

- **1. Pod security violation events**: Review admission rejections:
  ```bash
  kubectl get events -n apollo-airlines-apps --field-selector reason=FailedCreate
  ```
- **2. Runtime security context check**: Confirm active security settings:
  ```bash
  kubectl get pod -l app=booking -n apollo-airlines-apps \
    -o jsonpath='{.items[0].spec.containers[0].securityContext}'
  ```
- **3. Read-only filesystem verification**: Test that the container cannot write to root:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/booking -- touch /etc/testfile 2>&1
  # Expected: Read-only file system
  ```
