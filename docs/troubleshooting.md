---
title: "The Apollo11 Kubernetes Troubleshooting Bible"
description: "Systematic diagnostic flows and symptom-to-solution matrices for Pod crashes, networking failures, storage deadlocks, and Helm errors."
sidebar_label: "Troubleshooting Bible"
---

# The Apollo11 Kubernetes Troubleshooting Bible

When something breaks in a Kubernetes cluster, beginners often waste hours randomly deleting pods, editing YAML files without understanding, or rebuilding images.

This guide provides a **systematic, evidence-first diagnostic methodology** grounded in real issues encountered while operating Apollo Airlines.

---

## 🪜 The Golden Rule: The 5-Rung Evidence Ladder

Whenever you observe an anomaly, **stop and climb the evidence ladder in order**:

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ RUNG 5: Live User Endpoint (curl, browser, HTTP status codes)               │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ RUNG 4: Container Standard Out Logs (kubectl logs <pod> -c <container>)     │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ RUNG 3: Detailed Spec & Conditions (kubectl describe <resource> <name>)     │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ RUNG 2: Cluster Chronological Events (kubectl get events --sort-by=...)     │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ RUNG 1: High-Level Snapshot (kubectl get pods,svc,deploy -o wide)           │
 └─────────────────────────────────────────────────────────────────────────────┘
```

Never jump to Rung 4 (application logs) if Rung 1 shows the Pod is `Pending`! If a Pod is `Pending`, its container has not started, so it has no logs. Read Rung 2 (Events) instead!

---

## 🚨 1. Pod Lifecycle & Workload Failures

### Symptom: `CrashLoopBackOff`

The container process starts, fails or crashes, exits, and the kubelet repeatedly restarts it with exponential backoff delay.

#### How to Diagnose:
```bash
# 1. Inspect exit code and reason
kubectl describe pod <pod-name> -n <namespace> | grep -A 10 "Last State:"

# 2. Inspect logs of the crashed container (PREVIOUS instance)
kubectl logs <pod-name> -n <namespace> --previous
```

#### Common Causes & Fixes:
| Root Cause | Evidence in Logs / Describe | Actionable Fix |
|---|---|---|
| **Unhandled Code Panic / Crash** | Go stack trace or Python Traceback in `kubectl logs --previous` | Fix application bug in source code and recompile. |
| **Missing ConfigMap / Secret Key** | Describe shows `CreateContainerConfigError` or `RunContainerError` | Check `kubectl get configmap,secret -n <namespace>`. Verify that the exact key referenced in `valueFrom` exists. |
| **Database Connection Refused** | Logs show `dial tcp: connection refused` or `timeout connecting to postgres` | Check if database pod is running (`kubectl get pods -l tier=data`). Verify database hostname in `DATABASE_URL`. |
| **Port Binding Error** | Logs show `bind: address already in use` | Application code is attempting to bind multiple listeners to the same port, or listening on a privileged port (&lt; 1024) as non-root. |

---

### Symptom: `ImagePullBackOff` / `ErrImagePull`

The kubelet on the worker node cannot download or locate the requested container image.

#### How to Diagnose:
```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A 5 Events:
```

#### Common Causes & Fixes:
| Root Cause | Evidence in Describe Events | Actionable Fix |
|---|---|---|
| **Typo in Image Tag or Repository** | `manifest for <image>:<tag> not found` or `NotFound` | Verify image name in Deployment manifest. In kind local clusters, ensure you ran `kind load docker-image <image>:<tag>`. |
| **Private Registry Authentication** | `401 Unauthorized` or `403 Forbidden` | Create an `imagePullSecret` using `kubectl create secret docker-registry` and reference it in `spec.imagePullSecrets`. |
| **Rate Limiting** | `429 Too Many Requests` (Docker Hub) | Authenticate to Docker Hub, or mirror images to GitHub Packages (GHCR) or Amazon ECR. |

---

### Symptom: Pod Stuck in `Pending`

The Pod has been accepted by the API server, but the `kube-scheduler` cannot find a suitable worker node.

#### How to Diagnose:
```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A 8 Events:
```

#### Common Causes & Fixes:
| Root Cause | Evidence in Describe Events | Actionable Fix |
|---|---|---|
| **Insufficient Node Resources** | `0/2 nodes are available: 2 Insufficient cpu/memory` | The sum of all Pod `requests` exceeds available node capacity. Reduce container `resources.requests` or add worker nodes. |
| **Unsatisfied Node Taint** | `0/2 nodes are available: 1 node had untolerated taint {workload: search}` | The node has a taint that the Pod does not tolerate. Add matching `tolerations` to the Pod spec. |
| **Unbound PersistentVolumeClaim** | `pod has unbound immediate PersistentVolumeClaims` | The Pod mounts a PVC that cannot bind to a PV. Inspect the PVC using `kubectl describe pvc <pvc-name>`. |
| **Mismatched NodeSelector / Affinity** | `0/2 nodes are available: 2 node(s) didn't match Pod's node selector` | Verify node labels (`kubectl get nodes --show-labels`) match the Pod's `nodeSelector` or `nodeAffinity`. |

---

### Symptom: `OOMKilled` (Exit Code 137)

The container process was abruptly terminated by the Linux kernel Out-Of-Memory killer.

#### How to Diagnose:
```bash
kubectl describe pod <pod-name> -n <namespace> | grep -E "(OOMKilled|Exit Code)"
```
You will observe: `Reason: OOMKilled` and `Exit Code: 137`.

#### Explanation & Fix:
- Exit code 137 = $128 + 9$ (`SIGKILL`). The Linux kernel cgroup detected that the process consumed more RAM than its declared `resources.limits.memory`.
- Unlike CPU (which is throttled), memory cannot be compressed. The kernel must kill the process immediately to protect the host operating system.
- **Fix**: Increase `resources.limits.memory` in the Deployment, or profile your application for memory leaks.

---

## 🌐 2. Networking & Service Failures

### Symptom: Service Has `ENDPOINTS: <none>`

The Service exists, but traffic routed to it fails with connection timeout or connection refused.

#### How to Diagnose:
```bash
# Check endpoints behind the service
kubectl get endpoints <service-name> -n <namespace>
kubectl get endpointslices -n <namespace> -l kubernetes.io/service-name=<service-name>
```

#### Common Causes & Fixes:
1. **Selector Mismatch (The #1 beginner mistake!)**:
   - Check the Service selector: `kubectl get svc <name> -n <ns> -o jsonpath='{.spec.selector}'`
   - Check Pod labels: `kubectl get pods -n <ns> --show-labels`
   - If the Service selects `app: booking`, but the Pod is labeled `app: boking` or `name: booking`, the selector matches 0 pods!
2. **Pod Failing Readiness Probe**:
   - `Endpoints` only include Pods whose status condition is **`Ready: True`**!
   - If `booking` pods are in `Running` state, but failing `/readyz`, Kubernetes removes them from endpoints.
   - Run `kubectl describe pod <name>` and look for `Readiness probe failed`.

---

### Symptom: Cross-Namespace DNS Fails (`nslookup` returns NXDOMAIN)

An application in `apollo-airlines-ui` cannot communicate with a service in `apollo-airlines-apps`.

#### How to Diagnose:
```bash
# Exec into client pod and test DNS
kubectl exec -it <client-pod> -n apollo-airlines-ui -- nslookup <target-service>
```

#### Common Causes & Fixes:
- **Using Short Names Across Namespaces**:
  Inside `apollo-airlines-ui`, querying `http://identity:8080` fails because CoreDNS searches `identity.apollo-airlines-ui.svc.cluster.local`.
  **Fix**: When calling across namespace boundaries, always specify the namespace:
  `http://identity.apollo-airlines-apps:8080` or the full FQDN:
  `http://identity.apollo-airlines-apps.svc.cluster.local:8080`.

---

### Symptom: Gateway API Returns `503 Service Unavailable`

Envoy Gateway accepts the connection, but fails to reach the backend microservice.

#### How to Diagnose:
```bash
# Inspect the HTTPRoute status
kubectl describe httproute <route-name> -n <namespace> | grep -A 8 Conditions:
```

#### Common Causes & Fixes:
1. **Missing `ReferenceGrant` (Cross-Namespace Access)**:
   If an `HTTPRoute` in `apollo-airlines-apps` references a Service in `apollo-airlines-ui`, conditions will report:
   `ResolvedRefs: False` with `RefNotPermitted`.
   **Fix**: Apply a `ReferenceGrant` in the target namespace granting permission.
2. **Backend Service Has No Ready Endpoints**:
   Envoy Gateway cannot forward traffic if all backing pods are failing readiness probes.

---

## 💾 3. Storage & StatefulSet Issues

### Symptom: PVC Stuck in `Pending`

#### How to Diagnose:
```bash
kubectl describe pvc <pvc-name> -n <namespace> | grep -A 5 Events:
```

#### Common Causes & Fixes:
- **`WaitForFirstConsumer` Binding Mode**:
  If events say `Waiting for first consumer to be created before binding`, this is **normal behavior**! The provisioner is waiting for the Pod to be scheduled to a specific worker node/AZ before provisioning disk space.
- **Missing or Misspelled StorageClass**:
  If the PVC references `storageClassName: fast-ebs`, but no StorageClass with that name exists (`kubectl get storageclass`), the PVC stays `Pending` forever.

---

### Symptom: `FailedAttachVolume` (Zonal Cloud Constraint)

Occurs when running on AWS EKS or GCP GKE.

#### Explanation:
AWS EBS volumes are strictly zonal (e.g. `us-east-1a`). If a node dies in `us-east-1a` and Kubernetes tries to restart the database Pod on a node in `us-east-1b`, the EBS volume cannot physically attach across AZ boundaries!
**Fix**: Configure your StorageClass with `volumeBindingMode: WaitForFirstConsumer` and ensure node affinity matches volume topology.

---

## 📊 4. Autoscaling (HPA) Issues

### Symptom: HPA Shows `TARGETS: <unknown> / 70%`

#### How to Diagnose:
```bash
kubectl describe hpa <hpa-name> -n <namespace>
```

#### Common Causes & Fixes:
1. **Missing Resource Requests**:
   HPA calculates CPU percentage as `(Actual Usage / Requested CPU)`. If your Deployment containers do not specify `resources.requests.cpu`, HPA math cannot divide by zero!
   **Fix**: Declare CPU requests on all containers.
2. **`metrics-server` Not Running**:
   Test if metrics API is responding:
   `kubectl top pods -n <namespace>`
   If it returns `error: Metrics API not available`, deploy or restart `metrics-server`.

---

## 🧰 Quick Diagnostic Command Cheat Sheet

```bash
# Find all failing pods across the entire cluster
kubectl get pods -A | grep -vE "(Running|Completed)"

# Stream logs of all pods with a specific label
kubectl logs -n apollo-airlines-apps -l app=booking --tail=50 -f

# Check recent warning events across all namespaces
kubectl get events -A --field-selector type=Warning --sort-by=.metadata.creationTimestamp

# Temporarily test network access into a private cluster service
kubectl run curl-debug --rm -it --image=curlimages/curl -- sh
```
