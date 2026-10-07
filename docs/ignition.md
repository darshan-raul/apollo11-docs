---
title: "Ignition — Your First Kubernetes Cluster"
description: "Create a kind cluster, then learn to tell which component acted on a Pod, and which one failed, from the evidence."
sidebar_label: "Ignition (First Cluster)"
---

# Build Ignition: your first cluster

:::info[Page type · lab]
- Repo: `Apollo11` at commit `69113dcc80f77e32301d8ee7b9e73a67c923de96` ([setup](./labs/setup#prepare-the-verified-workspace)). Run from the repo root.
- Read the [Ignition chapters](./learn/cluster/why-orchestration) first.
:::

**Skill this lab builds:** given a Pod that is not running, name the component responsible in under a minute.

## Who does what (reference)

| Component | Where | Acts when | Leaves evidence as |
|---|---|---|---|
| `kube-apiserver` | control plane | Every request | Accepts/rejects `apply`; fills defaults |
| `etcd` | control plane | Every write | (stores objects; only the apiserver talks to it) |
| `kube-scheduler` | control plane | Pod has no `spec.nodeName` | `Scheduled` / `FailedScheduling` events; sets `nodeName` |
| `kube-controller-manager` | control plane | Desired ≠ observed (Deployments, Jobs…) | Creates/deletes objects. **Does nothing for a bare Pod** |
| `kubelet` | every node | Pod bound to its node | `Pulling`, `Pulled`, `Created`, `Started`, `BackOff` events; Pod status |
| `containerd` | every node | kubelet asks | Real containers (`crictl ps`) |
| `kube-proxy` / `kindnet` / CoreDNS | nodes / kube-system | Services, Pod networking, DNS | Used from Stage 1–2 |

## Diagnosis map (you will earn this table in Exercises 4–5)

| What you see | `NODE` column | Owner | First command |
|---|---|---|---|
| `Pending`, event `FailedScheduling` | `<none>` | scheduler | `kubectl describe pod` |
| `ErrImagePull` / `ImagePullBackOff` | set | kubelet + runtime | `kubectl describe pod` → Events |
| `CrashLoopBackOff` | set | your app | `kubectl logs --previous` |
| Gone after `delete`, nothing recreates it | n/a | nobody (no controller) | `ownerReferences` |

---

## Exercise 1: Build the cluster and map nodes to containers

**Goal:** prove each Kubernetes node is a Docker container, and identify which control-plane components run where.
**Time:** ~5 min · **Needs:** Docker running, no existing `apollo11` kind cluster.

1. **Predict:** with 1 control-plane and 2 workers, how many `docker ps` entries will `kind` create? Which node runs `etcd`?
2. **Do:**

```bash
kind create cluster --config stages/ignition/kind-config.yaml
kubectl config current-context
kubectl get nodes -L node-role,workload
docker ps --filter label=io.x-k8s.kind.cluster=apollo11 --format '{{.Names}}'
```

3. **Check:**
   - Context is `kind-apollo11`.
   - Three nodes `Ready`. The workers carry `workload=app` (Stages 4 and 7 use it).
   - `docker ps` lists `apollo11-control-plane`, `apollo11-worker`, `apollo11-worker2`.

4. **Locate the components:**

```bash
kubectl -n kube-system get pods -o wide
kubectl -n kube-system get daemonsets
```

   - Fill in this table from the output:

| Pod prefix | Node | Managed by (static Pod / DaemonSet / Deployment) |
|---|---|---|
| `etcd-…`, `kube-apiserver-…`, `kube-scheduler-…`, `kube-controller-manager-…` | ? | ? |
| `kube-proxy-…`, `kindnet-…` | ? | ? |
| `coredns-…` | ? | ? |

5. **Why:**
   - The four control-plane Pods exist only on `apollo11-control-plane` and are static Pods (the node's kubelet runs them from files; their names end in the node name).
   - `kube-proxy` and `kindnet` are DaemonSets: one per node, so you see three of each.
   - If the Docker host stops, every "node" stops with it. kind teaches roles, not availability.

6. **Your turn:** run `kubectl -n kube-system get pod kube-scheduler-apollo11-control-plane -o jsonpath='{.metadata.ownerReferences[0].kind}'`. What does the answer tell you about who owns a static Pod?

<details>
<summary>Answer</summary>

`Node`. The kubelet creates a read-only "mirror" Pod in the API for each static Pod, owned by the Node. Deleting the mirror Pod does not stop it.
</details>

> Small machine? Use `stages/ignition/kind-config-single.yaml` instead (context `kind-apollo11-dev`). Never run both variants together; their host ports overlap.

---

## Exercise 2: Author a Pod and see what the API server adds

**Goal:** write a Pod manifest yourself and identify the fields you did not write.
**Time:** ~10 min · **Needs:** Exercise 1.

1. **Predict:** you will submit ~15 lines of YAML. Will the stored Pod contain only those fields?
2. **Do:** generate a skeleton, then complete it.

```bash
mkdir -p learner-work/ignition
kubectl run apollo-shell --image=busybox:1.36.1 --restart=Always --port=8080 \
  --labels=app=shell,stage=ignition --dry-run=client -o yaml > learner-work/ignition/pod.yaml
cat learner-work/ignition/pod.yaml
```

   - The skeleton has no server process, so it would start `sh` and exit. **Edit the file:** add under the container

```yaml
      command: ["sh", "-c", "mkdir -p /www; echo 'Apollo11 Ignition ready' > /www/index.html; echo 'ignition HTTP server started'; exec httpd -f -p 8080 -h /www"]
```

3. **Check what the server would store** (nothing is created yet):

```bash
kubectl apply --dry-run=server -f learner-work/ignition/pod.yaml -o yaml \
  | grep -E 'dnsPolicy|schedulerName|terminationGracePeriodSeconds|priority:|tolerations|serviceAccountName|enableServiceLinks'
```

   - You wrote none of these fields. Each appears with a default.
   - `--dry-run=client` only checks the YAML locally. `--dry-run=server` runs the request through the API server, including defaulting and validation.

4. **Apply and compare with the reference:**

```bash
kubectl apply -f learner-work/ignition/pod.yaml
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
```

   - Compare your file with `stages/ignition/pod.yaml` (the reference). Same labels, same image, same server command.

5. **Why:**
   - Defaults (`schedulerName: default-scheduler`, `dnsPolicy: ClusterFirst`, tolerations for not-ready nodes…) are added by the API server, not by `kubectl`.
   - `kubectl apply` returning only means "accepted". Exercise 3 shows what happened next.

6. **Your turn:** run the server dry-run and read `status.qosClass`. Add `resources: {requests: {cpu: 50m}}` to the container and run it again. What changed, and what is that field used for later (Stage 4)? Then remove the lines.

<details>
<summary>Answer</summary>

`BestEffort` becomes `Burstable`. The API server computes the QoS class from requests/limits. The kubelet uses it to decide eviction order under node pressure.
</details>

---

## Exercise 3: Trace one Pod through the components

**Goal:** match every event and field to the component that produced it.
**Time:** ~10 min · **Needs:** `apollo-shell` Running.

1. **Predict:** list the order: *scheduled, image pulled, container created, container started, ready.* Which of those does the scheduler do?
2. **Do:**

```bash
kubectl get pod apollo-shell -o wide
kubectl describe pod apollo-shell | sed -n '/^Events:/,$p'
NODE=$(kubectl get pod apollo-shell -o jsonpath='{.spec.nodeName}')
docker exec "$NODE" crictl ps --name shell
kubectl get pod apollo-shell -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'
```

3. **Check:** copy the `Events` table and fill the last column.

| Reason | From (column in `describe`) | Component action |
|---|---|---|
| `Scheduled` | `default-scheduler` | chose the node, wrote `spec.nodeName` |
| `Pulling` / `Pulled` | `kubelet` | asked containerd to fetch the image |
| `Created` / `Started` | `kubelet` | containerd created and started the process |

   - `crictl ps` shows the same container from the node's runtime side. It is the container, not the Pod.
   - Conditions: `PodScheduled` (scheduler), `Initialized`, `ContainersReady`, `Ready` (kubelet).

4. **Prove the endpoint (rung 5):**

```bash
kubectl port-forward pod/apollo-shell 18080:8080 >/dev/null &
PF=$!; sleep 2
curl --fail -s http://127.0.0.1:18080/
kill $PF
```

   - Expected: `Apollo11 Ignition ready`.

5. **Why:**
   - Only the scheduler writes `spec.nodeName`. Only the node's kubelet starts containers. If you can say which of the two is stuck, you know where to look.
   - Rungs 1–3 explain *where* it stopped. Rung 5 is the only proof it works.

6. **Your turn:** the Pod is on one worker. Without using `-o wide`, print the node's internal IP and the Pod's IP, then explain why they differ.

<details>
<summary>Answer</summary>

```bash
kubectl get node "$NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}'
kubectl get pod apollo-shell -o jsonpath='{.status.podIP}{"\n"}'
```
The node IP is the Docker container's IP on the `kind` network. The Pod IP comes from `podSubnet 10.244.0.0/16`, allocated by the CNI (`kindnet`).
</details>

---

## Exercise 4: Break it: a Pod nothing can schedule

**Goal:** recognise a scheduling failure and fix it without recreating the Pod.
**Time:** ~8 min · **Needs:** Exercise 1.

1. **Predict:** you will request a node label (`disk=ssd`) that no node has. Will the Pod be `Pending`, `ContainerCreating`, or `Error`? Will it have a node?
2. **Inject:**

```bash
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: needs-ssd
  labels: {stage: ignition}
spec:
  nodeSelector:
    disk: ssd
  containers:
    - name: sleeper
      image: busybox:1.36.1
      command: ["sleep", "3600"]
YAML
```

3. **Symptom:**

```bash
kubectl get pod needs-ssd -o wide
```

   - `STATUS=Pending`, `NODE=<none>`.
4. **Diagnose** (rungs 1 → 3). Before you run anything, decide: scheduler or kubelet?

```bash
kubectl describe pod needs-ssd | sed -n '/^Events:/,$p'
kubectl get pod needs-ssd -o jsonpath='{.spec.nodeName}{"\n"}'
```

   - Event `FailedScheduling` from `default-scheduler`, message similar to `0/3 nodes are available: 1 node(s) had untolerated taint …, 2 node(s) didn't match Pod's node affinity/selector`.
   - `spec.nodeName` is empty: no node was ever chosen, so **the kubelet never saw this Pod**. There are no `Pulling` events.
5. **Fix** (change the cluster, not the Pod):

```bash
kubectl label node apollo11-worker disk=ssd
kubectl wait --for=condition=Ready pod/needs-ssd --timeout=60s
kubectl get pod needs-ssd -o wide
```

6. **Prove recovery:** the Pod is `Running` on `apollo11-worker`, with the same UID as before (no replacement happened). The scheduler retried on the new label.
7. **Clean up:**

```bash
kubectl delete pod needs-ssd
kubectl label node apollo11-worker disk-
```

8. **Why:**
   - `Pending` + no node ⇒ scheduler. The fix is node labels, taints or Pod constraints.
   - The control-plane node has a `NoSchedule` taint, which is why only the two workers are candidates for normal Pods.

9. **Your turn:** change `disk: ssd` to `kubernetes.io/hostname: apollo11-control-plane` and apply. Why is it still `Pending`, and what single field would let it schedule?

<details>
<summary>Answer</summary>

The control plane has the taint `node-role.kubernetes.io/control-plane:NoSchedule`. A matching `tolerations` entry on the Pod removes the block. A selector only narrows the candidates; it never overrides a taint.
</details>

---

## Exercise 5: Break it: a Pod the kubelet cannot start

**Goal:** tell a kubelet failure from a scheduling failure using one column.
**Time:** ~8 min · **Needs:** Exercise 1.

1. **Predict:** you will use a non-existent image tag. This time, will the Pod have a node? Which component reports the error?
2. **Inject:**

```bash
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
```

3. **Symptom (wait ~30 s):**

```bash
kubectl get pod bad-image -o wide -w     # Ctrl-C when you see ImagePullBackOff
```

   - `ErrImagePull`, then `ImagePullBackOff`. **`NODE` is set.**
4. **Diagnose:**

```bash
kubectl describe pod bad-image | sed -n '/^Events:/,$p'
kubectl get pod bad-image -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}{"\n"}'
```

   - `Scheduled` from `default-scheduler` succeeded. `Failed` / `BackOff` events come from `kubelet`.
   - The node exists, so the scheduler is not the problem.
5. **Fix without deleting the Pod:** a container's `image` is one of the few mutable Pod fields.

```bash
kubectl set image pod/bad-image sleeper=busybox:1.36.1
kubectl wait --for=condition=Ready pod/bad-image --timeout=90s
```

6. **Prove recovery:**

```bash
kubectl exec bad-image -- echo alive
kubectl get pod bad-image -o jsonpath='{.status.containerStatuses[0].restartCount}{" restarts, image="}{.spec.containers[0].image}{"\n"}'
```

   - Same Pod, same UID, new image.
7. **Clean up:** `kubectl delete pod bad-image`.
8. **Why:**
   - Exercise 4 vs 5: *no node* ⇒ scheduler; *node, container not running* ⇒ kubelet / runtime / image / registry.
   - `ImagePullBackOff` is the kubelet backing off retries. It will retry forever; it never gives up and never reschedules.

9. **Your turn:** make the container fail differently: `command: ["sh","-c","exit 1"]`. Predict the status, then use `kubectl logs --previous` and `describe` to read the exit code. Which row of the diagnosis map is it?

<details>
<summary>Answer</summary>

`CrashLoopBackOff` with `Exit Code: 1`. The image pulled fine, so it is an application problem, not a platform one. A restart is the kubelet applying `restartPolicy: Always`, increasing `restartCount` each time.
</details>

---

## Exercise 6: Delete a bare Pod and find out who cares

**Goal:** prove nothing recreates a bare Pod, and say what Stage 1 adds.
**Time:** ~5 min · **Needs:** `apollo-shell` Running.

1. **Predict:** you delete `apollo-shell`. Does anything recreate it? What field would prove an owner exists?
2. **Do:**

```bash
kubectl get pod apollo-shell -o jsonpath='ownerReferences={.metadata.ownerReferences}{"\n"}uid={.metadata.uid}{"\n"}'
kubectl delete pod apollo-shell
sleep 5
kubectl get pods
```

3. **Check:**
   - `ownerReferences=` is empty: no controller owns the Pod.
   - After deletion: `No resources found in default namespace.`
4. **Recover and prove:**

```bash
kubectl apply -f stages/ignition/pod.yaml
kubectl wait --for=condition=Ready pod/apollo-shell --timeout=90s
kubectl get pod apollo-shell -o jsonpath='{.metadata.uid}{"\n"}'
```

   - The UID differs from step 2: a different object, not a restart.
5. **Why:**
   - The kubelet restarts *containers* inside a Pod it is told to run (`restartCount` rises, UID stays). Nobody restarts a *deleted Pod object*.
   - Replacing Pods needs a controller that compares desired vs actual count. That is Stage 1's ReplicaSet.
6. **Your turn:** run `kubectl create deployment probe --image=busybox:1.36.1 -- sleep 3600`, then delete its Pod. How do the `ownerReferences` and the outcome differ? Clean up with `kubectl delete deployment probe`.

<details>
<summary>Answer</summary>

The Pod is owned by a ReplicaSet, which is owned by the Deployment. The ReplicaSet controller creates a replacement within seconds, with a new name and UID.
</details>

---

## Verify and clean up

```bash
bash stages/ignition/scripts/verify.sh
kubectl get pods
```

- `verify.sh` is the maintainer check. It runs its own crash/delete/reapply sequence and passes only on `kind-apollo11`-style contexts.
- Keep the cluster for Stage 1. To remove everything: `kind delete cluster --name apollo11`.

## You can now

- [ ] Say which component writes `spec.nodeName` and which one starts containers.
- [ ] Read a `describe` Events table and name the source of each line.
- [ ] Tell `Pending` (scheduler) from `ImagePullBackOff` (kubelet) from `CrashLoopBackOff` (app) in one command.
- [ ] Explain why a deleted bare Pod stays deleted.

## Checkpoint

1. Pod is `Pending`, `NODE` is `<none>`. Which component's events do you read?
2. `kubectl apply` printed `pod/x created`. Which evidence rung proves it runs?
3. Which Pod field can you change in place, and which components react?
4. What exactly does Stage 1 add that Exercise 6 lacked?

Next: [Stage 1: Liftoff](./stage-1).
