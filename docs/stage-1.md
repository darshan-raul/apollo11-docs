---
title: "Stage 1 — Liftoff: Workloads on Kubernetes"
description: "Move all ten Apollo components onto Kubernetes with Deployments, Services, ConfigMaps, Secrets, ServiceAccounts and Jobs, and understand why each replaces something from Launchpad and Ignition."
sidebar_label: "Stage 1: Liftoff (Workloads)"
---

# Stage 1: Liftoff

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage1`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage1) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: the `kind-apollo11` cluster from [Ignition](./ignition). Namespace: `apollo-airlines`.
- Concepts behind this stage: [ReplicaSets](./learn/cluster/replicasets) · [Deployments](./learn/cluster/deployments) · [Services and readiness](./learn/workloads/services-and-readiness) · [Configuration and identity](./learn/workloads/configuration-and-identity) · [Jobs and initialization](./learn/workloads/jobs-and-initialization) · [Rollouts and rollback](./learn/workloads/rollouts-and-rollback) · [Ephemeral state](./learn/workloads/ephemeral-state)
:::

## Where we left off

- **Launchpad** ran all ten components with Docker Compose on one machine. Compose gave us names (`booking-db`), environment variables and restart policies, but only on that one host.
- **Ignition** built a three-node cluster and ran **one bare Pod**. When we deleted it, it stayed deleted: nothing in the cluster wanted it back.
- So two gaps remain before Apollo can live on Kubernetes:
  - **Nothing keeps Pods alive.** A bare Pod is a one-off. Lose it and the airline loses that service.
  - **Nothing gives Pods a stable address.** Every replacement Pod gets a new IP. Booking cannot hard-code where flight lives.

Stage 1 closes both gaps, and moves the rest of what Compose did (config, secrets, start-up order) into Kubernetes objects.

## What changes in this stage

| Concern | Before (Launchpad / Ignition) | Stage 1 | Why it's better |
|---|---|---|---|
| Keeping a service running | Compose `restart:` on one host; bare Pod in Ignition | **Deployment → ReplicaSet → Pods** (2 replicas per app) | A controller compares *desired* vs *actual* and replaces lost Pods on any node |
| Finding another service | Compose service name on a Docker network | **Service** (`booking`, `flight`, …) with a label selector | One stable name and virtual IP in front of changing Pod IPs |
| Reaching the app from your laptop | Compose `ports:` | **NodePort** Services (30080–30084) | Works through kind's port mappings; good enough until Stage 2 |
| Configuration | `environment:` in `docker-compose.yml` | **ConfigMap** `apollo-airlines-config` | Config lives outside the image and outside the Pod template; change it once for all apps |
| Passwords and JWT key | Plain env vars in Compose | **Secret** `apollo-airlines-secrets` | Separated from config so access can be controlled (still not encrypted: Stage 8) |
| "Who is this Pod?" | Nothing | **13 ServiceAccounts**, token automount off | Each workload has its own identity, ready for RBAC later, with no API token it doesn't need |
| Loading seed data | `init.sql` mounted into Postgres in Compose | **Jobs** `init-*-db` that run once to completion | A one-shot task with retries and a clear `Complete`/`Failed` result |
| Database storage | Compose named volume (survived restarts) | **`emptyDir`** | Deliberately a step *backwards*: it shows what Pod-scoped storage means before Stage 3 fixes it |
| Shipping a new version | Rebuild and `docker compose up` | **Rolling update** with history and `rollout undo` | Old Pods keep serving until new ones are ready; bad versions can be undone |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `k8s/config/namespace.yaml` | The `apollo-airlines` Namespace | New: a boundary for names, quotas and later policy |
| `k8s/config/configmap.yaml` | Ports, DB names, service URLs, Redis URL | Replaces Compose `environment:` |
| `k8s/config/secrets.yaml` | `POSTGRES_PASSWORD`, `JWT_SECRET` | Replaces plain env vars |
| `k8s/config/serviceaccounts.yaml` | One ServiceAccount per workload and Job | New |
| `k8s/infra/<db>/` | Postgres ×3 and Redis: Deployment + Service each | Replaces Compose database services |
| `k8s/jobs/` | SQL in ConfigMaps + one Job per database | Replaces Compose's init-script mount |
| `k8s/apps/<service>/` | Six app Deployments + Services | Replaces Compose app services; replaces Ignition's `pod.yaml` |
| `k8s/kustomization.yaml` | Lists every file above | A single list for rendering; Kustomize proper comes in Stage 5 |
| `scripts/apply.sh` | Builds, loads and applies in dependency order | Replaces `docker compose up` |
| `scripts/verify.sh`, `teardown.sh` | Full check, and clean removal | — |

## Walkthrough

### Step 1: Read one service end to end before applying anything

Open [`k8s/apps/booking/booking-dep.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage1/k8s/apps/booking/booking-dep.yaml) and [`booking-svc.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage1/k8s/apps/booking/booking-svc.yaml). The parts that matter:

```yaml
# booking-dep.yaml (trimmed)
kind: Deployment
spec:
  replicas: 2                 # desired state: always two booking Pods
  selector:
    matchLabels: {app: booking}   # "the Pods I own carry this label"
  template:                   # the Pod shape the ReplicaSet stamps out
    metadata:
      labels: {app: booking}  # must match the selector above
    spec:
      serviceAccountName: booking
      containers:
        - image: apollo11/booking:latest
          ports: [{containerPort: 8082}]
          env:
            - name: FLIGHT_SERVICE_URL
              valueFrom: {configMapKeyRef: {name: apollo-airlines-config, key: FLIGHT_SERVICE_URL}}
            - name: JWT_SECRET
              valueFrom: {secretKeyRef: {name: apollo-airlines-secrets, key: JWT_SECRET}}
          readinessProbe: {httpGet: {path: /readyz, port: 8082}}
---
# booking-svc.yaml
kind: Service
spec:
  type: NodePort
  selector: {app: booking}    # the same label again: this is the only link to the Pods
  ports: [{port: 8082, targetPort: 8082, nodePort: 30082}]
```

- **What it is:** the Ignition Pod, wrapped in a template, plus a controller that wants two copies of it, plus a stable name in front.
- **Why this way:** the label `app: booking` appears three times. The Deployment uses it to find its Pods. The Service uses it to find where to send traffic. Neither one has a list of Pod names, because Pod names change. Labels are how Kubernetes connects things that come and go.
- **Compared with Ignition:** `pod.yaml` was a single, named Pod. Here nobody writes a Pod by hand. You write the *template*, and the controller produces Pods from it.
- **Compared with Launchpad:** in Compose, `FLIGHT_SERVICE_URL=http://flight:8081` worked because of Docker's DNS. It still says `http://flight:8081`, but now `flight` is a Kubernetes Service name, resolved by cluster DNS. The app code did not change.
- **Watch out:** Kubernetes does not check that these three labels agree. A typo is accepted and fails quietly. That is why the checks in "When something looks wrong" start with endpoints.

### Step 2: Apply in dependency order

```bash
kubectl config current-context        # must be kind-apollo11
bash stages/stage1/scripts/apply.sh   # add --skip-build to reuse loaded images
```

[`apply.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage1/scripts/apply.sh) runs six phases:

1. Namespace, ConfigMap, Secret, ServiceAccounts.
2. The three Postgres Deployments and Redis, with their Services.
3. Wait for those to be ready.
4. Run the three `init-*-db` Jobs and wait for `Complete`.
5. The six application Deployments and Services.
6. Wait for every rollout.

- **What happens:** the script builds six images, loads them straight into the kind nodes (no registry yet), then applies files in that order.
- **Why the order matters:** Kubernetes itself does not do ordering. If you apply everything at once, booking starts before its database exists, fails readiness, and keeps retrying. It would get there eventually, but the Jobs could fail first. The script waits at each boundary so every step starts on solid ground.
- **Compared with Launchpad:** Compose's `depends_on` did a weaker version of this. In Kubernetes, the cluster is expected to converge on its own, and scripts (later Helm hooks and Argo sync waves) add ordering only where it really matters.
- **Why images are loaded, not pulled:** there is no image registry yet. `imagePullPolicy: IfNotPresent` tells the kubelet to use the image already on the node. Stage 5 and the CI chapter introduce a registry.

### Step 3: See the ownership chain that keeps Pods alive

```bash
kubectl get deploy,rs,pods -n apollo-airlines -l app=booking
kubectl get rs -n apollo-airlines -l app=booking \
  -o custom-columns='RS:.metadata.name,DESIRED:.spec.replicas,OWNER:.metadata.ownerReferences[0].name'
```

- **What you see:** one Deployment, one ReplicaSet with a hash suffix, and two Pods whose names start with that ReplicaSet's name.
- **What it means:**
  - The **Deployment** owns the ReplicaSet. It manages *versions*: each new Pod template gets a new ReplicaSet.
  - The **ReplicaSet** owns the Pods. It manages *count*: it keeps exactly `replicas` Pods matching its selector.
  - Each Pod carries an `ownerReference` pointing back up. Delete a Pod and its ReplicaSet notices the count is short and makes a new one, with a new name and a new UID.
- **Compared with Ignition:** the bare Pod had no owner, so nothing noticed when it disappeared. Ownership is the difference.

### Step 4: See how the Service finds Pods

```bash
kubectl get svc booking -n apollo-airlines
kubectl get endpointslice -n apollo-airlines -l kubernetes.io/service-name=booking -o wide
kubectl get pods -n apollo-airlines -l app=booking -o wide
```

- **What you see:** the Service has one ClusterIP that never changes. The EndpointSlice lists the two Pod IPs, which match the Pod list.
- **What it means:** the EndpointSlice controller keeps watching for Pods that match the selector **and are Ready**, and updates the list. kube-proxy on every node turns that list into forwarding rules. Callers only ever use the Service name.
- **Why readiness is involved:** booking's `/readyz` checks its database and dependencies. A booking Pod that is running but can't reach its database is removed from the list, so it gets no traffic. A failing Pod stops receiving requests without anyone touching the Service.
- **Why NodePort here:** `type: NodePort` also opens port 30082 on every node. kind maps that to `localhost:30082`, so you can reach booking from your laptop. It is a direct, crude door. Stage 2 replaces it with a proper entry point.
- **Why `notification` has no NodePort:** only booking calls it. A service that nobody outside needs should not have a door to the outside.

### Step 5: See configuration and identity arrive in the Pod

```bash
kubectl get deploy booking -n apollo-airlines \
  -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{" <- "}{.valueFrom.configMapKeyRef.name}{.valueFrom.secretKeyRef.name}{"\n"}{end}'
kubectl get pod -n apollo-airlines -l app=booking -o jsonpath='{.items[0].spec.serviceAccountName}{"\n"}'
kubectl auth can-i get pods --as=system:serviceaccount:apollo-airlines:booking -n apollo-airlines   # no
```

- **ConfigMap vs Secret:** both become environment variables in the container. The split is about *who may read them*: later stages can let people read the ConfigMap but not the Secret. A Secret is only base64-encoded, not encrypted. Stage 8 introduces an external secret store.
- **Env vars are read at start-up:** if you change the ConfigMap, running Pods keep the old values until they restart. This is why config changes in later stages go with a rollout.
- **ServiceAccounts:** each workload runs as its own identity (`booking`, `booking-db`, `init-booking-db`, …). None of them need to talk to the Kubernetes API, so `automountServiceAccountToken: false` keeps a usable token out of the container. Stage 8 grants real permissions with RBAC where they are needed.
- **Compared with Launchpad:** Compose mixed config and secrets into one `environment:` block, and every container ran with the same (no) identity.

### Step 6: See the Jobs that seeded the databases

```bash
kubectl get jobs -n apollo-airlines
kubectl logs job/init-booking-db -n apollo-airlines
```

- **What a Job is:** a controller for work that should *finish*. A Deployment restarts a container that exits. A Job counts an exit code 0 as success and stops.
- **How these Jobs work** ([`init-booking-db.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage1/k8s/jobs/init-booking-db.yaml)):
  - Wait for `pg_isready` on `booking-db`, up to 30 tries.
  - Run `psql -v ON_ERROR_STOP=1 -f /init/init.sql`. The SQL is mounted from a ConfigMap.
  - `backoffLimit: 3` with `restartPolicy: Never`: failed attempts leave Pods you can read logs from.
- **Why `ON_ERROR_STOP`:** without it, a broken SQL file would still "succeed" and you would find out from empty tables later.

### Step 7: Use the airline

| Component | URL |
|---|---|
| Frontend | `http://localhost:30080` (log in as `passenger@apolloairlines.com` / `pass123`) |
| Flight API | `http://localhost:30081/api/flights` |
| Booking | `http://localhost:30082/readyz` |
| Identity | `http://localhost:30083/metrics` |
| Search | `http://localhost:30084/readyz` |

```bash
curl -s localhost:30081/api/flights | jq '.flights | length'
```

Make a booking in the UI. The request travels frontend → booking → identity and flight → booking-db → notification. Every hop is now a Service name resolved inside the cluster.

### Step 8: See self-healing and a rolling update

These are the two behaviours that Stage 1 exists for. Run them once and watch:

```bash
# Self-healing: delete a booking Pod and watch a new one appear
kubectl delete -n apollo-airlines --wait=false \
  $(kubectl get pod -n apollo-airlines -l app=booking -o name | head -1)
kubectl get pods -n apollo-airlines -l app=booking -w     # Ctrl-C after 2/2 Running

# Rolling update and rollback: ship a tag that doesn't exist, then undo it
kubectl set image deploy/search search=apollo11/search:missing-stage1-demo -n apollo-airlines
kubectl get rs,pods -n apollo-airlines -l app=search      # new RS stuck in ImagePullBackOff, old Pods still serving
curl -s localhost:30084/readyz                            # still OK
kubectl rollout undo deploy/search -n apollo-airlines
kubectl rollout status deploy/search -n apollo-airlines
```

- **Self-healing:** the deleted name is gone for good. The ReplicaSet made a *new* Pod to get back to two. That is reconciliation, the idea from Ignition, now doing real work.
- **The rollout:** changing the image changes the Pod template, so the Deployment creates a second ReplicaSet and scales it up while scaling the old one down. With the default `maxUnavailable` setting, an old Pod is not removed until a new one is Ready. Because the new Pods never become Ready, the old ones keep serving. A bad release stalls instead of causing an outage.
- **`rollout undo`:** points the Deployment back at the previous ReplicaSet's template. Nothing is rebuilt, the old ReplicaSet was kept for exactly this.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| Pods Running, `curl` fails, no errors anywhere | Service selector or `targetPort` doesn't match the Pods | `kubectl get endpointslice -n apollo-airlines -l kubernetes.io/service-name=<svc>` |
| Pod `0/1 Running` | Readiness failing, usually a dependency | `kubectl describe pod <pod>` → Events, then `/readyz` |
| `ImagePullBackOff` / `ErrImagePull` | Image tag not loaded into kind | `kubectl describe pod`; rerun `apply.sh` |
| `CrashLoopBackOff` | App exits on start (bad env, DB unreachable) | `kubectl logs <pod> --previous` |
| `CreateContainerConfigError` | ConfigMap or Secret key missing | `kubectl describe pod` → Events |
| Job `Failed`, no flights in the API | Seed SQL failed | `kubectl logs job/init-<name>-db` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| Delete `booking-db`'s Pod and every booking is gone | `emptyDir` lives and dies with the Pod | [Stage 3](./stage-3): PVCs and StatefulSets |
| Five NodePorts, one per service, plain HTTP | No single front door, no hostnames, no TLS | [Stage 2](./stage-2): DNS, Ingress, Gateway API |
| Everything in one namespace | Apps, UI and databases share one boundary | Stage 2 splits into `apollo-airlines-apps` / `-ui` |
| Probes are basic; Pods have no resource requests | The scheduler and kubelet are guessing | [Stage 4](./stage-4): probes, requests/limits, PDBs |
| Thirty YAML files applied by a script | Repeating values; no environments; no release history | [Stage 5](./stage-5): Helm, Kustomize, Argo CD |
| Secret is base64 in Git; no RBAC in use | Anyone with repo access has the password | Stage 8 (planned): Vault, RBAC |

## The journey so far

| Concern | Launchpad | Ignition | **Stage 1** |
|---|---|---|---|
| Runs on | One Docker host | Three-node kind cluster | Same cluster |
| Unit of deployment | Compose service | Bare Pod | **Deployment** |
| Recovery | `restart:` on one host | None | **ReplicaSet replaces Pods** |
| Service discovery | Docker DNS | Pod IP only | **Service + cluster DNS** |
| External access | `ports:` | `kubectl port-forward` | **NodePort** |
| Config / secrets | `environment:` | Inline in `pod.yaml` | **ConfigMap / Secret** |
| Data | Named volume | — | **`emptyDir` (ephemeral)** |

## Clean up

```bash
bash stages/stage1/scripts/verify.sh      # optional: the full automated check
bash stages/stage1/scripts/teardown.sh
kubectl get ns apollo-airlines            # NotFound
```

The kind cluster stays for Stage 2.

## You should now be able to explain

- Why a deleted booking Pod comes back with a new name, when Ignition's Pod did not.
- How a Service finds its Pods, and why a label typo fails without an error.
- Why a broken image tag stalls the rollout instead of taking search down.
- What `rollout undo` actually switches back.
- Why config and secrets are separate objects, and what a Secret does *not* protect.
- Why booking's data disappears when its database Pod is replaced.

**Next:** [Stage 2: Guidance](./stage-2) replaces five NodePorts with names, hostnames and a real front door.
