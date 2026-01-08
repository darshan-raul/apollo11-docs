# Stage 2: Structural Integrity

In this stage, we move beyond "making it work" to "making it production-ready." We introduce the structural elements that define a robust, scalable, and secure Kubernetes application.

## 1. Configuration & Metadata

Separating configuration from code is a 12-factor app principle. Kubernetes provides specific objects for this.

### ConfigMaps & Secrets
- **ConfigMaps**: Store non-confidential data in key-value pairs. Used for environment variables, command-line arguments, or configuration files (e.g., `nginx.conf`).
- **Secrets**: Similar to ConfigMaps but specifically for confidential data (passwords, OAuth tokens, SSH keys). They are stored base64-encoded (and preferably encrypted at rest).

```yaml
# Usage in Pod
envFrom:
  - configMapRef:
      name: my-config
  - secretRef:
      name: my-secret
```

### Labels, Selectors & Annotations
- **Labels**: Key/value pairs attached to objects (e.g., `app: core-api`, `env: prod`). They are used to identify and group attributes of objects.
- **Selectors**: The mechanism to query and grouping objects by labels. This is how a Service finds its Pods.
- **Annotations**: Attach arbitrary non-identifying metadata to objects. Useful for tools and libraries (e.g., `prometheus.io/scrape: "true"`).

## 2. Pod Lifecycle & Architecture

Defining how a Pod starts, runs, checks its health, and stops.

### Init Containers & Sidecars
- **Init Containers**: Specialized containers that run before app containers in valid Pods. They can contain utilities or setup scripts not present in an app image (e.g., waiting for DB to be ready).
- **Sidecars**: Helper containers running alongside the main application container in the same Pod (e.g., log shippers, proxies).

### Probes: Health Checks
Kubernetes relies on probes to determine the health of your application.
- **Liveness Probe**: "Is the container still running?" If it fails, kubelet kills the container, and it is subjected to its restart policy.
- **Readiness Probe**: "Is the container ready to accept traffic?" If it fails, the endpoint controller removes the Pod's IP from all Services.
- **Startup Probe**: "Has the container started?" Useful for slow-starting legacy apps; disables other probes until this passes.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 3
```

### Restart Policies
Determines behavior when a container exits.
- `Always`: (Default) Container is restarted if it stops.
- `OnFailure`: Restart only if it exits with non-zero code.
- `Never`: Do not restart.

### Timing & Grace Periods
- **`minReadySeconds`**: Minimum seconds a Pod must be ready without crashing for it to be considered "available". Crucial for slowing down rollouts.
- **`terminationGracePeriodSeconds`**: Amount of time Kubernetes waits for a Pod to shut down gracefully (SIGTERM) before forcibly killing it (SIGKILL). Default is 30s.

## 3. Capabilities & Deployment Strategy

Controlling how updates are rolled out.

### MaxUnavailable & MaxSurge
Used in `RollingUpdate` strategy to control the speed and safety of updates.
- **`maxUnavailable`**: check how many Pods can be unavailable during the update (e.g., "1" or "10%").
- **`maxSurge`**: How many Pods can be created above the desired amount (e.g., "1" or "10%").

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

## 4. Resource Management & Scheduling

Ensuring applications have resources and land on the right nodes.

### Resource Requests & Limits
- **Requests**: What the container *needs*. Kubernetes schedules the Pod on a node with at least this much available.
- **Limits**: The *maximum* a container can use. If it exceeds memory limit -> OOMKilled. If it exceeds CPU limit -> Throttled.
- **ResourceQuotas**: Constraints that limit aggregate resource consumption per Namespace.

### Scheduling Controls
- **Taints & Tolerations**:
  - **Taints** are applied to a Node to repel specific Pods (e.g., `dedicated=gpu:NoSchedule`).
  - **Tolerations** are applied to Pods to allow them to schedule on tainted nodes.
- **Node Affinity**: Rules to constrain which nodes your Pod is eligible to be scheduled on, based on node labels.
- **Pod Affinity/Anti-Affinity**:
  - **Affinity**: Run this Pod on the same node/zone as *these other* Pods (e.g., app + cache).
  - **Anti-Affinity**: Do *not* run this Pod on the same node/zone as *these other* Pods (e.g., high availability separating replicas).

## 5. Security & Stability

### SecurityContext
Defines privilege and access control settings for a Pod or Container.
- `runAsUser` / `runAsGroup`: Run as a specific UID/GID.
- `allowPrivilegeEscalation`: Prevent getting more privileges than the parent process.
- `readOnlyRootFilesystem`: Mounts the container's root filesystem as read-only.

### PodDisruptionBudgets (PDB)
limits the number of Pods of a replicated application that are down simultaneously from voluntary disruptions (e.g., draining a node for maintenance). Ensures service availability during cluster operations.
