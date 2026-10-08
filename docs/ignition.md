---
title: "Ignition — Your First Kubernetes Cluster"
description: "Create a three-node kind cluster, see what each Kubernetes component does, follow one Pod from apply to running, and see why a deleted bare Pod stays deleted."
sidebar_label: "Ignition (First Cluster)"
---

# Ignition: your first cluster

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/ignition`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/ignition) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: [Launchpad](./launchpad). Stop it first (`docker compose down` in `stages/launchpad`). You need Docker, `kind`, `kubectl` and `curl`.
- Concepts behind this stage: [Why orchestration](./learn/cluster/why-orchestration) · [Objects and the API](./learn/cluster/objects-and-api) · [Reconciliation and components](./learn/cluster/reconciliation-and-components) · [Pod lifecycle](./learn/cluster/pod-lifecycle)
:::

## Where we left off

- **Launchpad** ran all ten components with Docker Compose. Compose gave us images, service names on a Docker network, `environment:` blocks, health checks, start order and `restart: always`.
- But all of it is bound to **one Docker host**:
  - **No scheduling across machines.** Compose cannot pick a machine with free capacity. There is only one.
  - **No desired-state reconciliation.** Compose does what you ask when you run `up`, then stops paying attention. A removed container stays removed; an `unhealthy` one keeps getting traffic.
  - **Recovery is local.** `restart: always` is the Docker daemon on that host. If the host goes, so does everything.

Ignition does not move Apollo yet. It builds a **cluster** (a group of machines, called nodes, run as one system) and runs a single small Pod, so you can see the parts before Stage 1 puts the airline on them.

## What changes in this stage

| Concern | Before (Launchpad) | Ignition | Why it's better |
|---|---|---|---|
| Where things run | One Docker host | **Three nodes**: one control plane, two workers | Work can be placed on any worker |
| Who decides placement | Nobody; there is one host | **`kube-scheduler`** | Placement is a decision made from node state and Pod constraints |
| Where state is kept | Compose reads a file when you run it | **`kube-apiserver` + `etcd`** store every object | The cluster remembers what you asked for, not just your terminal |
| Unit of deployment | Compose service | **Pod** (one or more containers that share network and lifecycle) | The unit every later controller creates |
| Who starts containers | Docker daemon | **`kubelet`** on the chosen node, via `containerd` | Same job, now driven by the API instead of a local file |
| Restart of a crashed process | `restart: always` | **`restartPolicy: Always`**, applied by the kubelet | Same behaviour, same limit: a *deleted* Pod is not replaced |
| Describing what you want | `docker-compose.yml` | **Manifest** (`pod.yaml`) sent with `kubectl apply` | One API and one object format for everything that follows |
| Reaching the app | `ports:` | **`kubectl port-forward`** | A temporary tunnel for checks; Stage 1 adds Services |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `kind-config.yaml` | Cluster `apollo11`: 1 control plane, 2 workers, host port mappings for later stages | New: replaces "one Docker host" |
| `kind-config-single.yaml` | Cluster `apollo11-dev`: one node, for small machines | Alternative to the above |
| `pod.yaml` | One bare Pod, `apollo-shell`, running a tiny HTTP server | Replaces a Compose service, for one workload |
| `scripts/verify.sh` | Crash, delete and re-apply checks | — |

## Walkthrough

### Step 1: Create the cluster

Read [`kind-config.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/ignition/kind-config.yaml) first:

```yaml
# kind-config.yaml (trimmed)
kind: Cluster
name: apollo11                          # context becomes kind-apollo11
networking:
  podSubnet: "10.244.0.0/16"            # where Pod IPs come from
  serviceSubnet: "10.96.0.0/16"         # where Service IPs will come from (Stage 1)
  kubeProxyMode: "iptables"
nodes:
  - role: control-plane
    extraPortMappings:                  # host ports opened now, used later
      - {containerPort: 30080, hostPort: 30080}   # …30084: Stage 1 NodePorts
      - {containerPort: 30443, hostPort: 30443}   # Stage 2 entry point
  - role: worker
    labels: {node-role: worker, workload: app}
  - role: worker
    labels: {node-role: worker, workload: app}
```

```bash
kind create cluster --config stages/ignition/kind-config.yaml
kubectl config current-context                 # kind-apollo11
kubectl get nodes -L node-role,workload
docker ps --filter label=io.x-k8s.kind.cluster=apollo11 --format '{{.Names}}'
```

- **What you see:** three nodes `Ready`, and three Docker containers: `apollo11-control-plane`, `apollo11-worker`, `apollo11-worker2`.
- **What kind is:** "Kubernetes in Docker". Each node is a Docker container with a kubelet and container runtime inside it.
- **Why the port mappings now:** kind can only map host ports when the cluster is created. Stage 1 and Stage 2 need them, so they are set up front.
- **Why the `workload: app` label:** Stages 4 and 7 use it to steer where Pods are placed.
- **Compared with Launchpad:** still one physical machine. If the Docker host stops, every "node" stops. kind teaches the roles, not real availability.
- **Small machine?** Use `stages/ignition/kind-config-single.yaml` instead (context `kind-apollo11-dev`). Never run both: their host ports overlap.

### Step 2: See the components

```bash
kubectl cluster-info
kubectl -n kube-system get pods -o wide
kubectl -n kube-system get daemonsets
```

| Component | Runs on | What it does | Where you see its work |
|---|---|---|---|
| `kube-apiserver` | control plane | The only front door. Validates every request, fills in defaults, stores objects | `kubectl` accepts or rejects your manifest |
| `etcd` | control plane | Key-value store holding every object. Only the API server talks to it | Nothing directly |
| `kube-scheduler` | control plane | Picks a node for each Pod without one | `Scheduled` / `FailedScheduling` events; writes `spec.nodeName` |
| `kube-controller-manager` | control plane | Runs controllers that compare desired vs actual (Deployments, Jobs, …) | Creates and deletes objects. Does nothing for a bare Pod |
| `kubelet` | every node | Runs the Pods bound to its node, reports their status | `Pulling`, `Pulled`, `Created`, `Started`, `BackOff` events |
| `containerd` | every node | The container runtime the kubelet calls | Real containers (`crictl ps`) |
| `kube-proxy`, `kindnet` | every node (DaemonSet) | Service forwarding; Pod networking (the CNI) | Used from Stage 1 |
| CoreDNS | Deployment in `kube-system` | In-cluster DNS names | Used from Stage 1 |

```text
kubectl
   |
   v
API server <--> etcd
   |             desired and observed state
   +--> scheduler / controller manager
   |
   +--> kubelet on node --> container runtime --> Pod
```

- **Control-plane Pods** (`etcd-…`, `kube-apiserver-…`, `kube-scheduler-…`, `kube-controller-manager-…`) exist only on `apollo11-control-plane`. Their names end in the node name because they are **static Pods**: the node's kubelet runs them from files on disk. The API shows a read-only copy owned by the `Node`.
- **DaemonSets** (`kube-proxy`, `kindnet`) run one Pod per node, so you see three of each.
- **NetworkPolicy:** kindnet does not enforce it. That is deferred to Stage 8.
- **Compared with Launchpad:** Compose was one program doing everything. Kubernetes splits the job into components that only talk through the API server. The [Reconciliation and components](./learn/cluster/reconciliation-and-components) chapter explains why.

### Step 3: Create the first Pod with a command

Ask `kubectl` to show the object it would send, without sending it:

```bash
kubectl run apollo-shell \
  --image=busybox:1.36.1 \
  --restart=Always \
  --labels=app=shell,stage=ignition \
  --port=8080 \
  --dry-run=client -o yaml \
  -- sh -c 'mkdir -p /www; printf "Apollo11 Ignition ready\n" > /www/index.html; echo "ignition HTTP server started"; httpd -f -p 8080 -h /www & server_pid=$!; wait "$server_pid"'
```

Run it for real (the same command without `--dry-run=client -o yaml`), wait, then remove it:

```bash
kubectl run apollo-shell --image=busybox:1.36.1 --restart=Always \
  --labels=app=shell,stage=ignition --port=8080 \
  -- sh -c 'mkdir -p /www; printf "Apollo11 Ignition ready\n" > /www/index.html; echo "ignition HTTP server started"; httpd -f -p 8080 -h /www & server_pid=$!; wait "$server_pid"'
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
kubectl delete pod apollo-shell
```

- **What it is:** an *imperative* command: "do this now". It is quick, but leaves nothing to review or apply again.
- **Why look at the dry run:** every `kubectl` command ends up as an object sent to the API server. The YAML it prints is that object.

### Step 4: Move to a manifest

[`pod.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/ignition/pod.yaml) is the same Pod, written down:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: apollo-shell
  labels: {app: shell, stage: ignition}    # labels matter from Stage 1 on
spec:
  restartPolicy: Always                     # kubelet restarts the container if it exits
  containers:
    - name: shell
      image: busybox:1.36.1                 # a pinned tag, not latest
      imagePullPolicy: IfNotPresent
      command:
        - sh
        - -c
        - |
          mkdir -p /www
          printf 'Apollo11 Ignition ready\n' > /www/index.html
          echo 'ignition HTTP server started'
          httpd -f -p 8080 -h /www &        # the server runs as a child
          server_pid=$!
          wait "${server_pid}"              # the shell exits when the server dies
      ports:
        - {name: http, containerPort: 8080, protocol: TCP}
```

```bash
kubectl apply --dry-run=client -f stages/ignition/pod.yaml
kubectl apply --dry-run=server -f stages/ignition/pod.yaml -o yaml \
  | grep -E 'dnsPolicy|schedulerName|terminationGracePeriodSeconds|priority:|tolerations|serviceAccountName|enableServiceLinks|qosClass'
kubectl apply -f stages/ignition/pod.yaml
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
```

- **What it is:** a *declarative* description: "this is what should exist". You can review it, keep it in Git and apply it again.
- **Client vs server dry run:** `--dry-run=client` checks the YAML locally. `--dry-run=server` runs it through the API server, so you see what would be stored.
- **What the server adds:** fields you never wrote, each with a default: `schedulerName: default-scheduler`, `dnsPolicy: ClusterFirst`, `serviceAccountName: default`, tolerations for not-ready nodes, `qosClass: BestEffort` (no resource requests; Stage 4 changes this).
- **Why `wait "${server_pid}"`:** it ties the container's life to the HTTP server. If the server dies, the container exits, and the kubelet sees it. Step 7 uses this.
- **Compared with Launchpad:** a Compose service and a Pod both say "run this image with this command". The difference is where it goes: Compose acts on it locally and forgets; `kubectl apply` stores it in the cluster, and components act on the stored object.
- More in [Objects and the API](./learn/cluster/objects-and-api).

### Step 5: Follow the Pod through the components

```bash
kubectl get pod apollo-shell -o wide
kubectl describe pod apollo-shell | sed -n '/^Events:/,$p'
kubectl get pod apollo-shell -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'
NODE=$(kubectl get pod apollo-shell -o jsonpath='{.spec.nodeName}')
docker exec "$NODE" crictl ps --name shell
kubectl get node "$NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}'
kubectl get pod apollo-shell -o jsonpath='{.status.podIP}{"\n"}'
```

The `Events` table, read with the component that wrote each line:

| Reason | From | What happened |
|---|---|---|
| `Scheduled` | `default-scheduler` | Chose a worker and wrote `spec.nodeName` |
| `Pulling` / `Pulled` | `kubelet` | Asked containerd to fetch the image (skipped if already on the node) |
| `Created` / `Started` | `kubelet` | containerd created and started the process |

- **The sequence:** `kubectl apply` → API server stores the Pod with no node → scheduler picks one → that node's kubelet sees a Pod bound to it and starts the container → kubelet reports status back.
- **Conditions:** `PodScheduled` comes from the scheduler. `Initialized`, `ContainersReady` and `Ready` come from the kubelet.
- **Why only workers:** the control-plane node has a `NoSchedule` taint, so the scheduler only considers the two workers for normal Pods.
- **`crictl ps`:** the same container, seen from the node's runtime. It is the container, not the Pod.
- **Two IPs:** the node IP is the Docker container's address on the `kind` network. The Pod IP comes from `podSubnet 10.244.0.0/16`, given out by the CNI (`kindnet`).
- **Why this matters:** only the scheduler writes `spec.nodeName`. Only the kubelet starts containers. When a Pod is stuck, knowing which of the two stopped tells you where to look.

### Step 6: Read the evidence in order

When something is wrong, check in this order and stop at the first layer that explains it:

| Evidence | Command | Question it answers |
|---|---|---|
| Status | `kubectl get pod apollo-shell -o wide` | Pending, Running or failing? Which node? |
| Events | `kubectl get events --field-selector involvedObject.name=apollo-shell --sort-by=.metadata.creationTimestamp` | What decisions and failures happened, in order? |
| Detail | `kubectl describe pod apollo-shell` | Which image, command, conditions? |
| Logs | `kubectl logs apollo-shell` | What did the process say? (`ignition HTTP server started`) |
| Behaviour | port-forward plus `curl` | Does a user get the right answer? |

```bash
kubectl port-forward pod/apollo-shell 18080:8080 >/dev/null &
PF=$!; sleep 2
curl --fail -s http://127.0.0.1:18080/      # Apollo11 Ignition ready
kill $PF
```

- **Why the last rung matters:** `Running` means the process exists. Only the response proves the app works.
- **Why port-forward:** there is no Service yet, and the Pod IP is only reachable inside the cluster. `port-forward` is a tunnel through the API server, for checks only.
- **Compared with Launchpad:** `docker compose ps` and `logs` covered the first and fourth rungs. Events are new: they are how components report what they decided.

### Step 7: See the kubelet restart a crashed container

```bash
kubectl get pod apollo-shell \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,RESTARTS:.status.containerStatuses[0].restartCount'
kubectl exec apollo-shell -- sh -c 'kill "$(pidof httpd)"' || true   # the exec may drop; that's expected
kubectl get pod apollo-shell --watch                                   # Ctrl-C at 1/1 Running
kubectl get pod apollo-shell \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,RESTARTS:.status.containerStatuses[0].restartCount'
kubectl logs apollo-shell --previous
kubectl exec apollo-shell -- wget -qO- http://127.0.0.1:8080/
```

- **What happens:** the HTTP server dies, the shell's `wait` returns, the container exits. The kubelet applies `restartPolicy: Always` and starts a new container **in the same Pod**.
- **What you see:** same UID, `RESTARTS` up by one, the old container's logs under `--previous`, and the right HTTP response again.
- **Compared with Launchpad:** this is `restart: always` again, done by the kubelet instead of the Docker daemon. It restarts a *container*. It does not recreate a *Pod*.

### Step 8: See what a stuck Pod looks like

Two small Pods show the two places a Pod can stall. Apply each, look, then delete it.

```bash
# A Pod that asks for a node label no node has
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: needs-ssd
  labels: {stage: ignition}
spec:
  nodeSelector:
    disk: ssd                          # no node carries this label
  containers:
    - name: sleeper
      image: busybox:1.36.1
      command: ["sleep", "3600"]
YAML

# A Pod that asks for an image tag that does not exist
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: bad-image
  labels: {stage: ignition}
spec:
  containers:
    - name: sleeper
      image: busybox:1.36.1-does-not-exist
      command: ["sleep", "3600"]
YAML

sleep 30
kubectl get pod needs-ssd bad-image -o wide
kubectl describe pod needs-ssd | sed -n '/^Events:/,$p'
kubectl describe pod bad-image | sed -n '/^Events:/,$p'
kubectl delete pod needs-ssd bad-image
```

| Pod | Status | `NODE` | Events from | Meaning |
|---|---|---|---|---|
| `needs-ssd` | `Pending` | `<none>` | `default-scheduler`: `FailedScheduling`, e.g. `0/3 nodes are available: 1 node(s) had untolerated taint …, 2 node(s) didn't match Pod's node affinity/selector` | No node fits. The kubelet never saw this Pod |
| `bad-image` | `ErrImagePull` → `ImagePullBackOff` | set | `Scheduled` from the scheduler, then `Failed` / `BackOff` from `kubelet` | Placed fine; the node can't get the image |
| (third kind) | `CrashLoopBackOff` | set | `kubelet` `BackOff` | Image fine; your process keeps exiting. Read `kubectl logs --previous` |

- **The one-column rule:** no node means the scheduler. A node but no running container means the kubelet, the runtime, the image or the registry. A container that keeps restarting means the app.
- **Neither is a dead end:** the scheduler retries `needs-ssd` if a node later gets `disk=ssd`. The kubelet retries the image pull forever. Neither moves the Pod or gives up.
- **Why a selector can't reach the control plane:** a `nodeSelector` only narrows the candidates. It never overrides a taint; that needs a toleration.
- More in [Pod lifecycle](./learn/cluster/pod-lifecycle) and [Scheduling](./learn/reliability/scheduling).

### Step 9: Delete the bare Pod

```bash
kubectl get pod apollo-shell -o jsonpath='ownerReferences={.metadata.ownerReferences}{"\n"}uid={.metadata.uid}{"\n"}'
kubectl delete pod apollo-shell --wait=true
sleep 3
kubectl get pod apollo-shell      # NotFound
```

- **What you see:** `ownerReferences` is empty, and after the delete the Pod stays gone.
- **Why:** a *bare* Pod has no owner. The kubelet only restarts containers in Pods it is told to run. The controller manager only acts on objects it owns. Nothing in the cluster holds "there should be an `apollo-shell`" as a goal, so nothing brings it back.
- **The only way back:** a person runs `kubectl apply -f stages/ignition/pod.yaml` again. That creates a *new* object with a new UID, not a restart of the old one.
- **Compared with Launchpad:** the same result as `docker rm -f` on a Compose container. The cluster stores desired state, but a bare Pod declares only "this one Pod", not "keep one running".
- **What fixes it:** a controller that owns Pods and keeps their count. That is Stage 1's Deployment and ReplicaSet.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| `kind create cluster` fails on ports | Launchpad still running, or the other kind variant exists | `docker ps`; `kind get clusters` |
| Context is not `kind-apollo11` | Another cluster is selected | `kubectl config use-context kind-apollo11` |
| Node `NotReady` | Cluster still starting | `kubectl get nodes -w`; `kubectl -n kube-system get pods` |
| Pod `Pending`, `NODE` `<none>` | No node fits (selector, taint, capacity) | `kubectl describe pod <pod>` → Events from `default-scheduler` |
| `ErrImagePull` / `ImagePullBackOff` | Wrong image tag or no registry access | `kubectl describe pod <pod>` → Events from `kubelet` |
| `CrashLoopBackOff` | The process exits on start | `kubectl logs <pod> --previous` |
| `Running` but `curl` fails | App not listening, or port-forward stopped | `kubectl logs <pod>`; rerun `port-forward` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| A deleted Pod stays deleted | Recovery needs a person, exactly like Compose | [Stage 1](./stage-1): Deployments and ReplicaSets |
| Only one copy of the workload | One Pod failing is a full outage | [Stage 1](./stage-1): `replicas` |
| The Pod has only an IP, and a new Pod gets a new one | Nothing can find it by name | [Stage 1](./stage-1): Services and cluster DNS |
| Access only via `port-forward` | A debugging tunnel, not a way to serve users | [Stage 1](./stage-1) NodePort, then [Stage 2](./stage-2) |
| Config written inline in the command | No separation of config, secrets and image | [Stage 1](./stage-1): ConfigMaps and Secrets |
| No resource requests (`BestEffort`) | The scheduler places Pods blind; first to be evicted | [Stage 4](./stage-4): requests and limits |
| All nodes are containers on one Docker host | Teaches roles, not availability | Stage 9 (planned): a cloud cluster |

## The journey so far

| Concern | Launchpad | **Ignition** |
|---|---|---|
| Runs on | One Docker host | **Three-node kind cluster** |
| Unit of deployment | Compose service | **Bare Pod** |
| Recovery | `restart:` on one host | **Container restart by kubelet; deleted Pod not replaced** |
| Service discovery | Docker DNS | **Pod IP only** |
| External access | `ports:` | **`kubectl port-forward`** |
| Config / secrets | `environment:` | **Inline in `pod.yaml`** |
| Data | Named volume | **—** |

## Clean up

```bash
bash stages/ignition/scripts/verify.sh                          # optional: the automated check
kubectl delete -f stages/ignition/pod.yaml --ignore-not-found   # verify.sh leaves one apollo-shell behind
kubectl get pods                                                # No resources found
```

- `verify.sh` repeats the crash, delete and re-apply sequence. It refuses to run unless the context is `kind-apollo11` or `kind-apollo11-dev`.
- Keep the cluster: Stage 1 deploys onto it.
- To remove it entirely: `kind delete cluster --name apollo11` (or `apollo11-dev`), then check `kind get clusters`.

## You should now be able to explain

- Why each kind node is a Docker container, and what that does and doesn't teach.
- What the API server, etcd, scheduler, controller manager and kubelet each do.
- What the API server adds to a Pod you submit, and why `kubectl apply` returning only means "accepted".
- Which component writes `spec.nodeName`, and which one starts containers.
- How to tell a scheduling problem from an image problem from an app crash with one `kubectl get pod -o wide`.
- Why killing the process raised the restart count but kept the UID.
- Why the deleted Pod stayed deleted, and what kind of object would bring it back.

**Next:** [Stage 1: Liftoff](./stage-1) wraps this Pod in a Deployment, so a deleted Pod comes back, and moves all of Apollo onto the cluster.
