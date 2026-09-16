---
title: "The Apollo11 Kubernetes Command Reference"
description: "A practical, task-oriented command cheat sheet for kubectl, kind, helm, and docker compose grounded in Apollo Airlines workflows."
sidebar_label: "Command Reference"
---

# The Apollo11 Kubernetes Command Reference

This reference organizes the most critical commands for operating Apollo Airlines by operational task.

---

## 🏗️ 1. Cluster & Node Operations (`kind` & `kubectl`)

### Managing Local Clusters
```bash
# Create the 3-node Apollo11 cluster with port mappings
kind create cluster --config stages/ignition/kind-config.yaml

# List running kind clusters
kind get clusters

# Load a locally built Docker image into kind worker nodes
kind load docker-image apollo11/booking:latest --name apollo11

# Delete the kind cluster completely
kind delete cluster --name apollo11
```

### Node Inspection & Taints
```bash
# View all nodes with roles, status, and IP addresses
kubectl get nodes -o wide

# View node labels
kubectl get nodes --show-labels

# Taint a worker node (repel non-tolerating pods)
kubectl taint node apollo11-worker workload=search:NoSchedule

# Remove a taint from a node (note the trailing minus '-')
kubectl taint node apollo11-worker workload=search:NoSchedule-

# Safely drain a node for maintenance (evicts pods respecting PDBs)
kubectl drain apollo11-worker --ignore-daemonsets --delete-emptydir-data

# Mark a node schedulable again after maintenance
kubectl uncordon apollo11-worker
```

---

## 🔎 2. Inspecting Workloads & Resources

```bash
# Get all resources in the apps namespace
kubectl get all -n apollo-airlines-apps

# Filter resources by label selector
kubectl get pods -n apollo-airlines-apps -l app=booking

# Print custom columns (e.g. Pod Name, Node, and QoS Class)
kubectl get pods -n apollo-airlines-apps -o custom-columns=\
'NAME:.metadata.name,NODE:.spec.nodeName,QOS:.status.qosClass'

# Extract a specific field using JSONPath (e.g. all container images)
kubectl get pods -n apollo-airlines-apps \
  -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.spec.containers[*].image}{"\n"}{end}'

# Watch pod status transitions in real time
kubectl get pods -n apollo-airlines-apps -w

# Describe full resource specifications, status conditions, and events
kubectl describe deployment booking -n apollo-airlines-apps
kubectl describe pod <pod-name> -n apollo-airlines-apps
```

---

## 🔄 3. Deploying, Updating & Rollbacks

```bash
# Apply a declarative manifest or directory
kubectl apply -f stages/stage1/k8s/apps/booking/booking-dep.yaml
kubectl apply -k stages/stage5/overlays/dev/

# Preview changes without applying (dry run)
kubectl apply --dry-run=client -f stages/stage1/k8s/apps/booking/booking-dep.yaml

# Update a container image imperatively
kubectl set image deployment/booking booking=apollo11/booking:v1.1.0 -n apollo-airlines-apps

# Monitor rollout progression until completion
kubectl rollout status deployment/booking -n apollo-airlines-apps

# View deployment revision history
kubectl rollout history deployment/booking -n apollo-airlines-apps

# Undo a failed rollout (rollback to previous stable revision)
kubectl rollout undo deployment/booking -n apollo-airlines-apps

# Trigger a zero-downtime rolling restart of all replicas
kubectl rollout restart deployment/booking -n apollo-airlines-apps

# Scale replicas imperatively
kubectl scale deployment/booking --replicas=4 -n apollo-airlines-apps
```

---

## 🩺 4. Debugging, Logs & Execution

```bash
# View recent stdout/stderr logs of a Pod
kubectl logs <pod-name> -n apollo-airlines-apps

# Stream logs in real time
kubectl logs -f <pod-name> -n apollo-airlines-apps

# View logs from a previously crashed container (vital for CrashLoopBackOff!)
kubectl logs <pod-name> -n apollo-airlines-apps --previous

# Stream combined logs for all pods matching a label
kubectl logs -n apollo-airlines-apps -l app=booking --tail=50 -f

# Execute an interactive shell inside a running container
kubectl exec -it <pod-name> -n apollo-airlines-apps -- /bin/sh

# Run a single command inside a container without an interactive TTY
kubectl exec -n apollo-airlines-apps identity-db-0 -- \
  psql -U postgres -d identity -c "SELECT count(*) FROM users;"

# Forward a local port directly to a private cluster Pod
kubectl port-forward pod/booking-xxx 18082:8082 -n apollo-airlines-apps

# Forward a local port to a Service or Gateway
kubectl port-forward svc/grafana 3000:3000 -n apollo-observability
```

---

## 🌐 5. Networking & Gateway API

```bash
# List all Services with their ClusterIPs and NodePorts
kubectl get svc -A

# Inspect auto-generated endpoints tracking healthy Pods
kubectl get endpoints -n apollo-airlines-apps
kubectl get endpointslices -n apollo-airlines-apps

# Inspect Gateway API infrastructure
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproutes -A
kubectl get referencegrants -A

# Check conditions on Envoy Gateway (verify Programmed=True)
kubectl describe gateway apollo-gateway -n apollo-airlines-apps

# Retrieve the external LoadBalancer IP assigned by MetalLB
kubectl get gateway apollo-gateway -n apollo-airlines-apps \
  -o jsonpath='{.status.addresses[0].value}'
```

---

## 💾 6. StatefulSets & Storage

```bash
# List StatefulSets and their replicas
kubectl get statefulsets -n apollo-airlines-apps

# List PersistentVolumeClaims (PVCs) and binding status
kubectl get pvc -n apollo-airlines-apps

# List physical PersistentVolumes (PVs) and reclaim policies
kubectl get pv

# View available StorageClasses and provisioners
kubectl get storageclass
```

---

## 📦 7. Helm Release Management

```bash
# Check syntax and validate a chart
helm lint stages/stage5/helm/apollo11

# Render templates locally to inspect generated YAML
helm template apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml

# Install a chart with environment overrides
helm install apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-dev.yaml \
  -n apollo-airlines-apps

# Upgrade an existing release
helm upgrade apollo11 stages/stage5/helm/apollo11 \
  -f stages/stage5/helm/apollo11/values-prod.yaml \
  -n apollo-airlines-apps

# View release revision history
helm history apollo11 -n apollo-airlines-apps

# Roll back to a previous revision
helm rollback apollo11 1 -n apollo-airlines-apps

# Uninstall a release
helm uninstall apollo11 -n apollo-airlines-apps
```

---

## 📈 8. Metrics, Autoscaling & Resources

```bash
# Check CPU and memory consumption across worker nodes
kubectl top nodes

# Check live CPU and memory consumption across Pods
kubectl top pods -n apollo-airlines-apps

# Inspect Horizontal Pod Autoscalers (HPA)
kubectl get hpa -A
kubectl describe hpa search-hpa -n apollo-airlines-apps

# Inspect Vertical Pod Autoscaler (VPA) recommendations
kubectl get vpa -A -o yaml

# Query the raw Metrics API endpoint
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/apollo-airlines-apps/pods
```

---

## 🐳 9. Docker & Docker Compose (Launchpad)

```bash
# Build and launch Apollo Airlines in background
docker compose up --build -d

# Inspect running container status and health
docker compose ps

# Follow container logs
docker compose logs -f booking

# Inspect the bridge network and container IPs
docker network inspect launchpad_apollo-airlines

# Stop containers without removing persistent named volumes
docker compose down

# Stop containers and DESTROY all persistent volumes
docker compose down -v
```
