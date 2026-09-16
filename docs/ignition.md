---
title: Ignition — First Kubernetes Cluster
description: Create a kind cluster, run one Pod, and learn evidence-first debugging.
---

# Ignition — First Kubernetes Cluster

Ignition introduces the Kubernetes control loop with one deliberately small HTTP Pod. The lesson is not “a Pod is a tiny VM”; it is that the API server stores desired state, a scheduler places work, and the kubelet keeps the container process running on a node.

## Build

```bash
cd Apollo11
docker info >/dev/null
kind create cluster --config stages/ignition/kind-config.yaml
kubectl get nodes -o wide
kubectl get pods -n kube-system
```

Use `kind-config-single.yaml` on a small machine; its context is `kind-apollo11-dev`. Do not create both variants because their host ports overlap. kind nodes are Docker containers, not additional VMs.

Create the Pod imperatively, inspect the generated YAML, then apply the committed manifest:

```bash
kubectl run apollo-shell --image=busybox:1.36.1 --restart=Always --dry-run=client -o yaml -- sh -c 'mkdir -p /www; printf "Apollo11 Ignition ready\n" > /www/index.html; httpd -f -p 8080 -h /www'
kubectl delete pod apollo-shell --ignore-not-found
kubectl apply --dry-run=client -f stages/ignition/pod.yaml
kubectl apply -f stages/ignition/pod.yaml
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
```

## Concepts: the Kubernetes control loop

The API server is the authenticated front door for the cluster. `etcd` stores the API objects. The scheduler chooses a node for an unscheduled Pod. Controllers compare desired state with observed state and create or change resources. The kubelet on each node asks the container runtime to start and supervise containers. CoreDNS resolves cluster names, while kube-proxy implements Service forwarding. A kind node is a Docker container containing these node processes; it is not a separate virtual machine.

### What happens after `kubectl apply`

`kubectl` reads your file and sends an HTTPS request to the API server. The API server authenticates and authorizes the caller, validates the object schema, runs admission, and stores the object in `etcd`. It does not itself start a container. The scheduler watches for Pods without a node assignment and writes a placement. The kubelet watches objects assigned to its node, pulls the image if needed, starts the container through the runtime, and reports conditions and container status.

This is why a successful `kubectl apply` is only the beginning of the evidence chain. It proves the API accepted the desired object. `kubectl get` shows current status. Events show decisions and failures. Logs show the process's perspective. A port-forward or request proves the user-visible contract.

### Pod lifecycle and restart semantics

A Pod has a lifecycle distinct from its container. The kubelet can restart a failed container while retaining the Pod UID. The Pod can then remain `Running` even though its process has restarted several times. If the Pod object is deleted, that identity is gone. A controller such as a ReplicaSet may create a new Pod, but a bare Pod has no owner to recreate it.

`restartPolicy: Always` applies to containers inside this Pod. It is not a replica controller. `imagePullPolicy: IfNotPresent` lets kind use a preloaded image, which is convenient locally but can hide whether a registry tag is available. Later stages use image tags and rollout policies to make artifact identity more explicit.

### Namespaces and context safety

A namespace is an API grouping and policy boundary, not a VM or network boundary. Ignition uses the default namespace for a minimal experiment. Later stages put workloads, UI, observability, and platform components in deliberate namespaces. `kubectl config current-context` tells you which cluster receives a command; `-n` tells you which namespace is targeted. Always confirm both before deleting or patching anything.

## YAML explainer

`apiVersion: v1` selects the core API group. `kind: Pod` selects the object type. `metadata.labels` gives later selectors something to match. `spec.restartPolicy: Always` asks the kubelet to restart the container in this Pod, but it does **not** make the Pod itself durable. `containerPort` documents the port and helps tooling; it does not publish a host port. A Pod is the smallest schedulable unit and is replaceable: its IP, name, and UID are not durable application identity.

## Inspect: the evidence ladder

Use status → events → detail → logs → behavior:

```bash
kubectl get pod apollo-shell -o wide
kubectl get events --field-selector involvedObject.name=apollo-shell --sort-by=.metadata.creationTimestamp
kubectl describe pod apollo-shell
kubectl logs apollo-shell
kubectl port-forward pod/apollo-shell 18080:8080
curl --fail http://127.0.0.1:18080/
```

The first four commands explain cluster state; `curl` proves a user-visible contract. `Running` alone does not prove the application is reachable.

### What each evidence rung can prove

`get` is a snapshot and can hide history. Events preserve recent scheduling, image, mount, and probe messages, but expire. `describe` assembles spec, conditions, and recent events for one object. Logs show stdout/stderr for a container, but an image that never starts has no application logs. Port-forward plus `curl` proves a network path to the Pod and an application response, but it bypasses the Service and external edge that later stages introduce.

When debugging, begin with the smallest object that exhibits the symptom. If the Pod is Pending, application logs are irrelevant; read scheduler events. If it is Running but the request fails, inspect the command, port, and process logs. If the Pod works through port-forward but not through a Service, the problem has moved to selectors, ports, endpoints, or routing.

## Break and recover

Delete the process inside the Pod and watch `restartCount` increase while the Pod UID remains stable:

```bash
kubectl exec apollo-shell -- sh -c 'kill 1' || true
kubectl get pod apollo-shell -w
kubectl get pod apollo-shell -o jsonpath='{.status.containerStatuses[0].restartCount}{"\n"}'
```

Now delete the bare Pod:

```bash
kubectl delete pod apollo-shell
kubectl get pod apollo-shell
kubectl apply -f stages/ignition/pod.yaml
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
```

The Pod returns only because you reapplied the manifest, with a new UID. Stage 1 adds a Deployment and ReplicaSet so a controller performs this replacement.

## Gotchas

- kind’s default `kindnet` CNI does not enforce NetworkPolicy; Apollo11 defers the behavioral lab until a capable CNI is selected.
- `kubectl apply` manages an object; it does not create an owner/controller.
- Events are namespaced and expire; collect them while the failure is present.
- `kubectl describe` is evidence, not a fix. Read the command, image, conditions, and events together.

## Read the Pod manifest line by line

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: apollo-shell
  labels:
    app: shell
    stage: ignition
spec:
  restartPolicy: Always
  containers:
    - name: shell
      image: busybox:1.36.1
      imagePullPolicy: IfNotPresent
      command: [sh, -c]
      args:
        - |
          mkdir -p /www
          printf 'Apollo11 Ignition ready\n' > /www/index.html
          httpd -f -p 8080 -h /www
      ports:
        - name: http
          containerPort: 8080
```

`metadata.name` is the object identity in the namespace. Labels are metadata for future queries; they do not route traffic by themselves. `containers[].name` identifies the container for logs and exec. `image` identifies the artifact, while `imagePullPolicy` controls when the node asks for it. `command` replaces the image entrypoint, and `args` supplies arguments; a shell command that starts a background server must keep the foreground process alive or the container exits. `ports` documents the intended listener but does not create a Service or publish a host port.

## Imperative versus declarative work

`kubectl run` is useful for a quick experiment and for generating a starting manifest with `--dry-run=client -o yaml`. The generated YAML often contains fields you should remove or normalize before committing. A declarative file records the desired object in reviewable form and can be applied repeatedly.

Neither style creates a controller for a bare Pod. The distinction is command syntax versus ownership model: imperative and declarative requests both create the same kind of object if they send a Pod to the API server. Stage 1 changes the ownership model by introducing a Deployment.

## Observe the node boundary

```bash
docker ps --filter label=io.x-k8s.kind.cluster=apollo11
kubectl get nodes -o wide
kubectl get pod apollo-shell -o wide
kubectl get pod apollo-shell -o jsonpath='{.spec.nodeName}{" uid="}{.metadata.uid}{"\n"}'
```

The Docker container is the kind node. The Kubernetes Pod is scheduled inside that node. The Pod's container is launched by the node runtime. These are three layers of identity, which is why a Docker container name and a Kubernetes Pod name are not interchangeable.

## Failure experiments and predictions

Before running each break, predict the evidence you expect:

| Break | Expected evidence | Why |
| --- | --- | --- |
| Kill the process | Restart count rises; Pod UID stays | Kubelet restarts a container in the same Pod |
| Delete the Pod | NotFound; no replacement | No controller owns a bare Pod |
| Use a bad image | Pending/ErrImagePull; no app logs | Runtime cannot create the container |
| Use a bad command | CrashLoopBackOff; exit code/logs | Container starts then exits |
| Port-forward wrong port | Forwarding or curl error | Process listener and declared port differ |

The prediction is part of the lab. After the experiment, compare the result with the model and update the model if it was wrong.

## Ignition checkpoint questions

1. Which component stores the object, which assigns a node, and which starts the container?
2. What is the difference between a container restart and a Pod replacement?
3. What does `restartPolicy: Always` not do?
4. Why can a successful `kubectl apply` be followed by an unhealthy workload?
5. Which evidence rung would you use for a Pending Pod, and why are application logs not your first step?
6. What new controller must Stage 1 add to make Pod deletion self-healing?

## Checkpoint

Explain API server, etcd, scheduler, controller manager, kubelet, runtime, CoreDNS, and kube-proxy. Then continue to [Stage 1](./stage-1).
