---
title: "Stage 5 — Payload Integration: Helm, Kustomize & GitOps"
description: "Replace 53 hand-applied YAML files with a Helm chart and releases, see Kustomize as the patch-based alternative, then let Argo CD keep the cluster equal to Git, and understand what each tool adds over the one before."
sidebar_label: "Stage 5: Payload (Delivery)"
---

# Stage 5: Payload Integration

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage5`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root. Needs `helm` on your PATH.
- Builds on: [Stage 4](./stage-4). The workloads are the same; only the way they are delivered changes. Namespaces: `apollo-airlines-apps`, `apollo-airlines-ui` (Argo CD adds `-dev-`, `-staging-` and `-prod-` pairs).
- Concepts behind this stage: [Rendering and Helm](./learn/delivery/rendering-and-helm) · [Promotion and rollback](./learn/delivery/promotion-and-rollback) · [Kustomize and overlays](./learn/delivery/kustomize-comparison) · [GitOps and ownership](./learn/delivery/gitops-and-ownership) · [CI and image delivery](./learn/delivery/ci-and-image-delivery)
:::

## Where we left off

- **Stage 4** made every workload reliable: three probes, graceful shutdown, `Guaranteed` resources, priority, spreading and PDBs.
- But look at how it got there: 53 YAML files, applied in order by `apply.sh`. That has three problems:
  - **Copy-paste.** The same probe block, `preStop` hook and resource numbers are written out in six Deployment files. Changing the readiness period means six edits, and missing one is silent.
  - **One environment.** Booking has 2 replicas and image `:latest` because that's what the file says. A cheap dev cluster with 1 replica, or a prod with 3 replicas, pinned images and PDBs, would need a second (and third) copy of every file.
  - **No release history.** `kubectl apply` only knows the current state. `rollout undo` can undo one Deployment, but nothing records "what did we ship last Tuesday, all 53 files of it" or can put it all back.
- And there is a fourth, quieter one: **nothing stops drift.** If someone runs `kubectl scale` or `kubectl edit`, the cluster no longer matches the files, and nobody is told.

Stage 5 does not change Apollo itself. It replaces the way Apollo is delivered, one tool at a time, and each tool exists because the previous one couldn't do something.

## What changes in this stage

| Concern | Stage 4 | Stage 5 | Why it's better |
|---|---|---|---|
| Source of the manifests | 53 hand-written files | **One Helm chart**: templates + `values.yaml` | A setting lives in one place; templates reuse it everywhere |
| Environments | One, hard-coded | **`values-{dev,staging,prod}.yaml`** (Helm) or **`overlays/{dev,staging,prod}`** (Kustomize) | Only the differences are written down: replicas, image tag, PDBs |
| Catching mistakes | Found when the Pod fails | **`values.schema.json`** checked at render time | `replicas: 0` or a misspelt tier is refused before anything reaches the cluster |
| Installing | `apply.sh` applies files in order | **`helm upgrade --install … --wait`** (one release) | One command, and it waits for the app to be ready |
| History and undo | `rollout undo`, per Deployment | **Helm revisions**: `helm history`, `helm rollback` | Every install or upgrade is recorded; the whole app can go back to a known-good revision |
| Who applies changes | A person running a script | **Argo CD** syncs from Git | Git is the only edit point; drift is detected and (in dev/staging) undone |
| Where images come from | Built locally, loaded into kind | Still local for Helm/Kustomize; **GHCR** images built by CI for Argo CD and prod | The same tested image can be promoted between environments |
| Database password in app env | Written into `DATABASE_URL` | Built from the Secret: `$(POSTGRES_PASSWORD)` | The password lives only in the Secret |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `helm/apollo11/Chart.yaml` | Chart name and version (`1.0.0`) | New |
| `helm/apollo11/values.yaml` | Every setting with its default: images, tiers, probes, grace periods, PDBs, Gateway, MetalLB | New: replaces the numbers scattered over Stage 4's files |
| `helm/apollo11/values-{dev,staging,prod}.yaml` | Per-environment overrides | New |
| `helm/apollo11/values.schema.json` | Rules the values must follow | New |
| `helm/apollo11/templates/{config,infra,apps,ui,jobs,pdb,gateway}/` | Go templates that produce the manifests | Replace `stages/stage4/k8s/` |
| `helm/apollo11/bundles/` | Envoy Gateway v1.5.0 and MetalLB v0.14.5 install files | Replaces `k8s/gateway/00-…` and `k8s/metallb/00-…` |
| `overlays/base/generated.yaml` + `kustomization.yaml` | A committed plain render of the chart | New: the Kustomize starting point |
| `overlays/{dev,staging,prod}/kustomization.yaml` | Patches on top of the base; `prod/pdb.yaml` adds PDBs | New |
| `argocd/` | Argo CD install, `AppProject`, three `Application`s, platform objects, scripts | New |
| `scripts/apply.sh`, `verify.sh`, `teardown.sh` | `--mode helm` (default) or `--mode kustomize`, `--env dev\|staging\|prod` | Replace Stage 4's scripts |
| `code/` | The Stage 4 services (same probes and shutdown handling) | Carried over |
| `.github/workflows/main.yml` (repo root) | CI: lint, render, build six images, push to GHCR | New |

## Walkthrough

### Step 1: See one template replace six copies

In Stage 4, every Deployment had its own copy of the probes and resources. In the chart, booking's template [`templates/apps/booking.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/helm/apollo11/templates/apps/booking.yaml) reads them from [`values.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/helm/apollo11/values.yaml):

```yaml
# values.yaml (trimmed)
image:
  repository: apollo11
  tag: latest
apps:
  booking:
    tier: flagship                    # picks a row from tiers below
    port: 8082
    replicas: 2
    priorityClassName: apollo-airlines-app-critical
tiers:
  flagship: {cpu: 200m, memory: 256Mi}
probes:
  readiness:
    httpGet: {path: /healthz/ready}
    periodSeconds: 5
    failureThreshold: 3
```

```yaml
# templates/apps/booking.yaml (trimmed)
{{- $appCfg := index .Values.apps "booking" -}}      # booking's block from values
{{- $tier := index .Values.tiers $appCfg.tier -}}    # its resource tier
spec:
  replicas: {{ $appCfg.replicas }}
  template:
    spec:
      containers:
        - image: "{{ .Values.image.repository }}/booking:{{ .Values.image.tag }}"
          {{- with .Values.probes.readiness }}
          readinessProbe:
            httpGet: {path: {{ .httpGet.path }}, port: {{ $appCfg.port }}}
            periodSeconds: {{ .periodSeconds }}
          {{- end }}
          resources:
            requests: {cpu: {{ $tier.cpu }}, memory: {{ $tier.memory }}}
            limits:   {cpu: {{ $tier.cpu }}, memory: {{ $tier.memory }}}
```

- **Helm** is a tool that turns *templates* (YAML with `{{ }}` placeholders) plus *values* (settings) into plain Kubernetes YAML. That step is called **rendering**. The cluster never sees a template, only the rendered result.
- **Why this way:** the probe settings are written once and used by all six apps. The Stage 4 resource tiers became a named table (`default`, `flagship`, `low`, `edge`); each app just names its tier.
- **Compared with Stage 4:** the rendered booking Deployment is the same as Stage 4's file, with one improvement: `DATABASE_URL` is now built as `postgresql://postgres:$(POSTGRES_PASSWORD)@booking-db…`, taking the password from the Secret instead of writing it into the manifest.
- **The cost:** templates are harder to read than plain YAML, and a template bug can affect every app at once. That's why the next step renders before applying.

### Step 2: Render and compare environments, without a cluster

```bash
C=stages/stage5/helm/apollo11
helm lint $C
helm template apollo11 $C -f $C/values-dev.yaml  --show-only templates/apps/booking.yaml > /tmp/booking-dev.yaml
helm template apollo11 $C -f $C/values-prod.yaml --show-only templates/apps/booking.yaml > /tmp/booking-prod.yaml
diff /tmp/booking-dev.yaml /tmp/booking-prod.yaml

# The schema refuses bad values before anything is applied
helm template apollo11 $C --set apps.booking.replicas=0 >/dev/null
helm template apollo11 $C --set apps.booking.tier=huge  >/dev/null
```

The environment files only hold what differs ([`values-prod.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/helm/apollo11/values-prod.yaml)):

```yaml
# values-prod.yaml (trimmed)
image:
  repository: ghcr.io/darshan-raul/apollo11   # registry images, not local kind images
  tag: v1.0.0                                 # pinned, not :latest
  pullPolicy: Always
apps:
  booking: {replicas: 3}
pdb:
  enabled: true
  booking: {minAvailable: 2}                  # 3 replicas, at most 1 evicted at a time
```

| | Dev | Staging | Prod |
|---|---|---|---|
| Replicas per app | 1 | 2 | 3 |
| Image | `apollo11/*:latest` (local) | `apollo11/*:latest` | `ghcr.io/darshan-raul/apollo11/*:v1.0.0` |
| PDBs | Off | Off | On, `minAvailable: 2` |

- **What you see:** the diff shows only replicas, image and pull policy. Names, ports, probes and resources are identical. The two bad `--set` commands fail with `values don't meet the specifications of the schema` and name the path.
- **How values combine:** `values.yaml` first, then each `-f` file, then `--set`. Later wins.
- **Why render first:** reading a diff of two renders is the cheapest review there is. It needs no cluster and shows exactly what an environment change will do.
- **Compared with Stage 4:** a dev/prod difference would have meant two copies of every file, and comparing them by eye.

### Step 3: Install Apollo as a Helm release

```bash
bash stages/stage4/scripts/teardown.sh                      # Stage 4 owns the same names
bash stages/stage5/scripts/apply.sh --mode helm --env dev   # add --skip-build to reuse images

helm list -A
helm history apollo11 -n apollo-airlines-apps
kubectl get secret -n apollo-airlines-apps -l owner=helm
kubectl get deploy booking -n apollo-airlines-apps --show-labels | tr ',' '\n' | grep managed-by
```

[`apply.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/scripts/apply.sh) in Helm mode:

1. Builds and loads the six images.
2. Applies the Envoy Gateway and MetalLB bundles, and waits for their CRDs and the MetalLB webhook.
3. Creates both namespaces and the TLS Secret `apollo-edge-tls`.
4. Runs `helm upgrade --install apollo11 … -f values-dev.yaml --wait --wait-for-jobs --timeout 10m`.
5. Waits for MetalLB, Envoy, the StatefulSets, seed Jobs and Deployments.

- **A release** is one installed copy of a chart, with a name (`apollo11`) and a numbered **revision** for each install, upgrade or rollback. Helm stores each revision as a Secret, `sh.helm.release.v1.apollo11.v1`, in the release namespace. That stored record is what makes diff, upgrade and rollback possible later.
- **What you see:** `apollo11 … deployed … revision 1`, and every object labelled `app.kubernetes.io/managed-by=Helm`.
- **Why the bundles go before Helm:** the chart creates a Gateway and an IP pool, which are custom resources. Their types (CRDs) must already exist, or the API server answers "no matches for kind". The script installs them first and tells the chart not to (`--set gateway.envoy.bundleInstall=false --set metallb.bundleInstall=false`).
- **Why `--wait`:** without it, Helm reports success as soon as the API server accepts the objects, healthy or not. Step 4 shows the difference.
- **Why the TLS Secret isn't in the chart:** it is generated per cluster and kept across reinstalls. If Helm owned it, uninstalling would delete the certificate your browser trusts.
- **Compared with Stage 4:** `apply.sh` applied 53 files and kept no record. Now there is one command, one release and a history.

### Step 4: Upgrade, ship a bad release, roll back

```bash
C=stages/stage5/helm/apollo11; NS=apollo-airlines-apps

# A bad upgrade: an image tag that doesn't exist, without --wait
helm upgrade apollo11 $C -n $NS --reuse-values --set image.tag=v999-missing
helm status apollo11 -n $NS | grep -E 'STATUS|REVISION'      # deployed, revision 2
kubectl get pods -n $NS | grep -E 'ImagePull|ErrImage'        # new Pods can't start
kubectl rollout status deploy/booking -n $NS --timeout=10s    # times out

# Roll back to the last good revision
helm history apollo11 -n $NS
helm rollback apollo11 1 -n $NS --wait
helm history apollo11 -n $NS                                  # revision 3: "Rollback to 1"
kubectl rollout status deploy/booking -n $NS
```

- **`--reuse-values`:** keeps the values of the current release (dev file and the script's `--set`s) and changes only the tag. Without it, the upgrade would fall back to `values.yaml` defaults.
- **What you see:** Helm says `deployed`, but the new Pods are in `ImagePullBackOff`. The old Pods keep serving: that's the rolling update from [Stage 1](./stage-1) and readiness from [Stage 4](./stage-4) working underneath Helm.
- **`deployed` means applied, not healthy.** Helm reports what the API server accepted. Health is a separate question you answer with `rollout status` and a real request.
- **Rollback goes to a known-good revision.** You pick the revision that worked (1), not the bad one (2). Helm re-applies revision 1's stored manifest as a *new* revision 3. Nothing is deleted from history, so you can always see what happened.
- **What rollback does not undo:** data. A row the bad version wrote to Postgres stays. Helm only knows about Kubernetes objects.
- **The safer way to upgrade:**

| Flag | Waits for readiness? | On failure |
|---|---|---|
| (none) | No | Reports `deployed` anyway |
| `--wait` | Yes, up to `--timeout` | Release marked `failed`; nothing reverted |
| `--atomic` (`--rollback-on-failure` in Helm 4) | Yes | Marked `failed`, then rolled back automatically |

- **Compared with Stage 4:** `rollout undo` reverses one Deployment's template. `helm rollback` reverses the whole app (all Deployments, ConfigMaps, PDBs, routes) to one recorded point.

### Step 5: Kustomize, the same app without templates

Helm solves repetition with templates, but some teams don't want a template language at all. **Kustomize** (built into `kubectl`) starts from plain YAML and applies **patches**: small, named changes like "set booking's replicas to 1".

```yaml
# overlays/dev/kustomization.yaml (trimmed)
resources:
  - ../base                     # the plain manifests
labels:
  - pairs: {environment: dev}   # added to every object
    includeSelectors: false
replicas:
  - name: booking
    count: 1
images:
  - name: apollo11/booking
    newTag: latest
```

```bash
bash stages/stage5/scripts/teardown.sh --mode helm          # one installer at a time
kubectl kustomize stages/stage5/overlays/dev  > /tmp/k-dev.yaml
kubectl kustomize stages/stage5/overlays/prod > /tmp/k-prod.yaml
diff /tmp/k-dev.yaml /tmp/k-prod.yaml | grep -E '^[<>] +(replicas|image):|environment:' | sort | uniq -c

bash stages/stage5/scripts/apply.sh --mode kustomize --env dev --skip-build
helm list -A                                                 # empty: no release
kubectl get deploy booking -n apollo-airlines-apps --show-labels | tr ',' '\n' | grep -E 'managed-by|environment'
```

- **Where the base comes from:** [`overlays/base/generated.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/overlays/base/generated.yaml) is a committed `helm template` of the chart. CI re-renders the chart and fails if the two differ, so the two paths can't quietly drift apart.
- **What you see:** dev and prod differ only in replicas, images and the `environment` label; prod also adds `prod/pdb.yaml`. After apply, `helm list` is empty and the Deployment carries `managed-by=kustomize` and `environment=dev`.
- **What Kustomize gives up:** there is no release record and no `rollback` command. The history is Git: to undo, you revert the commit and apply again.
- **Why it's still here:** for differences between environments inside one repo, patches on real YAML are easier to review than templates. Helm suits a package that others install with their own values.

| | Helm | Kustomize |
|---|---|---|
| Input | Templates + values | Plain YAML + patches |
| Logic (if, loops) | Yes | No |
| Release record and rollback | Yes | No (Git history is the record) |
| Comes with | `helm` CLI | `kubectl` |

- **Why one installer at a time:** Helm and Kustomize would both claim the same objects. Whoever applies last wins, and the other tool's view becomes wrong. That's why teardown comes before switching.

### Step 6: Argo CD, Git applies the change

Helm and Kustomize both still need **someone to run a command**. Neither notices if the cluster changes afterwards. **GitOps** turns this around: the desired state lives in Git, and a controller inside the cluster keeps making the cluster match it. **Argo CD** is that controller.

```bash
bash stages/stage5/scripts/teardown.sh --mode kustomize --env dev
bash stages/stage5/argocd/install.sh --offline                # vendored Argo CD v3.5.1
bash stages/stage5/argocd/scripts/bootstrap.sh --sync
kubectl get application -n argocd \
  -o custom-columns=NAME:.metadata.name,AUTO:.spec.syncPolicy.automated,SYNC:.status.sync.status,HEALTH:.status.health.status
```

One `Application` per environment, [`argocd/applications/dev.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage5/argocd/applications/dev.yaml):

```yaml
# applications/dev.yaml (trimmed)
kind: Application
spec:
  project: apollo-airlines                 # the AppProject: allowed repo and namespaces
  source:
    repoURL: https://github.com/darshan-raul/Apollo11.git
    targetRevision: HEAD
    path: stages/stage5/helm/apollo11      # the same chart as Step 3
    helm:
      valueFiles: [values-dev.yaml]
      parameters:
        - {name: namespaces.apps, value: apollo-airlines-dev-apps}
        - {name: image.repository, value: ghcr.io/darshan-raul/apollo11}
  syncPolicy:
    automated:
      prune: true                          # delete objects removed from Git
      selfHeal: true                       # undo changes made outside Git
```

Now change the cluster by hand and watch:

```bash
kubectl scale deploy/booking -n apollo-airlines-dev-apps --replicas=5
kubectl get application apollo11-dev -n argocd -w            # OutOfSync, then Synced again
kubectl get deploy booking -n apollo-airlines-dev-apps -o jsonpath='{.spec.replicas}{"\n"}'   # 1
```

- **What bootstrap sets up:** a shared platform (one GatewayClass, the MetalLB pool, PriorityClasses), six namespaces, the `apollo-airlines` **AppProject** (which repo and namespaces Argo may use; cluster-scoped objects denied), and three Applications: `apollo11-dev`, `-staging`, `-prod`.
- **What happens on drift:** Argo compares the rendered chart with the live objects. Your `kubectl scale` makes the app `OutOfSync`; self-heal sets replicas back to what `values-dev.yaml` says, within about three minutes at most. Delete a Service and it comes back the same way.
- **Where to make a lasting change:** in Git. Edit `values-dev.yaml`, commit, and Argo applies it. `kubectl` changes are temporary by design.
- **Prod is different on purpose:** `apollo11-prod` has no `automated` block. Argo shows the diff, and a person decides when to sync. It also ignores `/spec/replicas` on Deployments, so an on-call engineer can scale by hand during an incident without Argo undoing it.
- **Argo is not a Helm release:** `helm list -A` shows nothing. Argo renders the chart itself and applies the result, so Argo's sync history replaces `helm history`.
- **Images come from GHCR:** the Applications pull `ghcr.io/darshan-raul/apollo11/*`, built and pushed by the CI workflow. Promotion means moving the same image tag from dev to prod, not rebuilding ([CI and image delivery](./learn/delivery/ci-and-image-delivery)).
- **Compared with Step 3:** with Helm, the cluster changed when you ran `helm upgrade`. With Argo CD, it changes when Git changes, and changes from anywhere else are reported or undone.

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| `values don't meet the specifications of the schema` | A value breaks `values.schema.json` | Read the path in the message; `helm template … --debug` |
| `no matches for kind "Gateway"` / `"IPAddressPool"` | CRDs not installed before the chart | Rerun `apply.sh`; `kubectl get crd \| grep -E 'gateway\|metallb'` |
| Helm says `deployed`, Pods in `ImagePullBackOff` | Bad image tag; Helm didn't wait | `helm history apollo11 -n apollo-airlines-apps`, then `helm rollback` to the last good revision |
| `another operation (install/upgrade/rollback) is in progress` | An earlier Helm command was interrupted | `helm history`, then roll back to the last `deployed` revision |
| `invalid ownership metadata` or objects that change back | Two installers (Helm, Kustomize, Argo) own the same objects | `kubectl get deploy booking -n <ns> --show-labels`; tear one down |
| `accumulating resources … no such file or directory` | Wrong path in a `kustomization.yaml` | `kubectl kustomize <overlay>` |
| Argo app `OutOfSync` and never fixes itself | Prod (manual sync) or `selfHeal` off | `kubectl get application -n argocd`; sync in the UI or CLI |
| Argo app `Synced` but `Degraded` | Git applied correctly; the app itself is failing | `kubectl get pods -n apollo-airlines-dev-apps`; check events |
| `ImagePullBackOff` only under Argo | GHCR images not reachable from the cluster | `bash stages/stage5/scripts/build-images.sh`, then `bootstrap.sh --sync --image-repository apollo11` |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| "Healthy" only means Pods are ready | No latency, error rate or traces; a slow release looks fine | [Stage 6](./stage-6): metrics, logs, traces |
| Replica counts are fixed per environment | Traffic peaks get the same number of Pods; no caching | [Stage 7](./stage-7): Redis cache, HPA, VPA |
| `secret.jwtSecret` and the DB password sit in `values.yaml` in Git | Anyone who can read the repo has them; Argo just applies them | [Stage 8](./stage-8) (planned): Vault, RBAC, policy |
| "Environments" are namespaces on one kind cluster | Dev can starve prod; a cluster failure takes all three | [Stage 9](./stage-9) (planned): EKS |
| A release goes to all users at once | A bad version reaches everyone before you notice | [Stage 10](./stage-10) (planned): progressive delivery |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | Stage 2 | Stage 3 | Stage 4 | **Stage 5** |
|---|---|---|---|---|---|---|---|
| Runs on | One Docker host | Three-node kind cluster | Same cluster | Same cluster | Same cluster | Same cluster | Same cluster |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment | Deployment + StatefulSet | Same | **Helm release** (or overlay, or Argo Application) |
| Recovery | `restart:` on one host | None | ReplicaSet replaces Pods | Same | + StatefulSet keeps name and volume | + liveness restarts; PDBs | Same, **+ Argo self-heal undoes drift** |
| Service discovery | Docker DNS | Pod IP only | Service + cluster DNS | Same, across two namespaces | + headless Services | Same | Same |
| Entry point | `ports:` | `kubectl port-forward` | NodePort | Envoy Gateway on MetalLB, TLS | Same | Same | Same, **installed by the chart** |
| Config / secrets | `environment:` | Inline in `pod.yaml` | ConfigMap / Secret | Same | Same | Same | **Rendered from values** |
| Data | Named volume | — | `emptyDir` | `emptyDir` | PVC per database | Same | Same |
| Health checks | Compose `healthcheck:` | None | `/healthz` + `/readyz` | Same | Same | Startup, liveness, readiness | Same, **set once in values** |
| Resources | Not set | Not set | Not set | Not set | Not set | `requests == limits` | Same, **as named tiers** |
| Environments | One | One | One | One | One | One | **dev, staging, prod** |
| Undo a bad change | Rebuild | — | `rollout undo` | Same | Same | Same | **`helm rollback` / Git revert** |
| How it's deployed | `docker compose up` | `kubectl apply -f pod.yaml` | `apply.sh` | `apply.sh --substage N` | `apply.sh` | `apply.sh` | **`helm upgrade --install`, `kubectl kustomize`, Argo CD sync** |

## Clean up

Use the line for the installer you used last:

```bash
bash stages/stage5/scripts/teardown.sh --mode helm --purge                # Helm
bash stages/stage5/scripts/teardown.sh --mode kustomize --env dev --purge # Kustomize
bash stages/stage5/argocd/scripts/teardown.sh --full                      # Argo CD (apps, project, namespaces, argocd)
kubectl get ns | grep -E 'apollo|argocd' || echo "clean"
```

- `--purge` also deletes both namespaces (and their PVCs), Envoy Gateway and MetalLB. The kind cluster stays for Stage 6.

## You should now be able to explain

- What Helm does with templates and values, and why rendering before applying is the cheapest review.
- How dev, staging and prod differ, and where each difference is written down.
- What a Helm release and revision are, where Helm stores them, and why `deployed` doesn't mean healthy.
- Why a rollback goes to a known-good revision, creates a new revision, and leaves data alone.
- What Kustomize does instead of templates, and what it gives up.
- Why two installers must not own the same objects.
- How Argo CD undoes a `kubectl scale`, why prod waits for a person, and where a lasting change has to be made.

**Next:** [Stage 6: Mission Operations](./stage-6) adds metrics, logs and traces, so "healthy" can mean more than "ready".
