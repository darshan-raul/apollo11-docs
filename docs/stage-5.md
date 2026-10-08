---
title: "Stage 5 — Payload Integration: Helm, Kustomize & GitOps"
description: "Render, release, break and roll back Apollo with Helm and Kustomize, then let Argo CD enforce Git."
sidebar_label: "Stage 5: Payload (Delivery)"
---

# Build Stage 5: Payload Integration

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Chart: `stages/stage5/helm/apollo11`.
- Read the [Payload Integration chapters](./learn/delivery/rendering-and-helm) first.
- **Pick one installer at a time.** Helm (Exercises 2–3), Kustomize (Exercise 5) and Argo CD (Exercise 6) each own the same objects. Tear one down before using the next: `bash stages/stage5/scripts/teardown.sh --mode helm` (or `--mode kustomize`).
- Before starting this stage, tear down the previous one (`bash stages/stage4/scripts/teardown.sh`) and confirm its namespaces are gone.
- Exercises 1 and 4 need no cluster state.
:::

**Skill this lab builds:** answer "what will this change do, who owns it afterwards, and how do I undo it?" before you apply anything.

## Five words that are not synonyms

| Word | Means | Proof |
|---|---|---|
| **Render** | Templates → YAML on your machine | `helm template` / `kubectl kustomize` output |
| **Apply** | API server accepted the objects | `kubectl apply` / `helm install` returns |
| **Release** (Helm) | A recorded revision of what was applied | `helm history` |
| **Sync** (Argo) | Live state equals Git | `Synced` |
| **Healthy** | Pods actually work | rollout complete + a real request |

## Chart map

| Path | Role |
|---|---|
| `Chart.yaml`, `values.yaml` | Metadata, defaults |
| `values-{dev,staging,prod}.yaml` | Per-environment overrides (replicas, image tag, PDBs) |
| `values.schema.json` | Rejects bad values at render time |
| `templates/{config,infra,jobs,apps,ui,gateway,pdb}` | The Go-templated manifests |

---

## Exercise 1: Render and compare environments without touching the cluster

**Concepts:** [Rendering and Helm](./learn/delivery/rendering-and-helm)

**Goal:** trace one value from a values file to a rendered field, and list exactly what dev and prod differ in.
**Time:** ~10 min

1. **Predict:** which of these differ between dev and prod renders: replica counts, image tag, PDB objects, Service names, container ports?
2. **Do:**

```bash
C=stages/stage5/helm/apollo11
helm lint $C
helm template apollo11 $C -f $C/values-dev.yaml  > /tmp/dev.yaml
helm template apollo11 $C -f $C/values-prod.yaml > /tmp/prod.yaml
for f in dev prod; do echo "== $f"; grep -c '^kind:' /tmp/$f.yaml; grep -E '^kind: PodDisruptionBudget' /tmp/$f.yaml | wc -l; done
diff /tmp/dev.yaml /tmp/prod.yaml | grep -E '^[<>] +(replicas|image):|^[<>] kind:' | sort | uniq -c | sort -rn | head -20
```

3. **Check:** prod has the 2 extra `PodDisruptionBudget` objects, `replicas: 3`, image `…:v1.0.0`. Service names and ports are identical.
4. **Trace one value:** find `replicas` for booking in three places:

```bash
grep -n -A1 'booking:' $C/values-dev.yaml | head -4                         # source value
grep -n 'replicas' $C/templates/apps/booking.yaml                           # where the template reads it
helm template apollo11 $C -f $C/values-dev.yaml --show-only templates/apps/booking.yaml | grep replicas   # result
```

5. **Break: values the schema rejects (no cluster involved)**

```bash
helm template apollo11 $C --set apps.booking.replicas=0 >/dev/null
helm template apollo11 $C --set apps.booking.tier=huge  >/dev/null
```

   - Both fail with `values don't meet the specifications of the schema` and name the offending path. A typo is caught before any object reaches the API server.
6. **Why:** Helm is a program that produces YAML; the schema is its type check. Reading the diff of two renders is the cheapest review of an environment change.
7. **Your turn:** create `learner-work/stage5/values-lab.yaml` that sets booking to 2 replicas and image tag `v9.9.9`, **only**. Render it on top of dev and prove with `diff` that exactly those two things change.

<details>
<summary>Solution</summary>

```yaml
image:
  tag: v9.9.9
apps:
  booking:
    replicas: 2
```
```bash
helm template apollo11 $C -f $C/values-dev.yaml -f learner-work/stage5/values-lab.yaml > /tmp/lab.yaml
diff /tmp/dev.yaml /tmp/lab.yaml
```
Later `-f` files win. The tag change touches every image line, not only booking, because `image.tag` is global. To pin one service, the template would need a per-app tag.
</details>

---

## Exercise 2: Install, then read the release record

**Concepts:** [Rendering and Helm](./learn/delivery/rendering-and-helm) · [Promotion and rollback](./learn/delivery/promotion-and-rollback)

**Goal:** show that `helm install` adds a release record that `kubectl apply` would not.
**Time:** ~15 min · **Needs:** a clean `kind-apollo11` (no earlier stage left running).

1. **Predict:** after install, where does Helm keep its revision history?
2. **Do:**

```bash
bash stages/stage5/scripts/apply.sh --mode helm --env dev
helm list -A
helm history apollo11 -n apollo-airlines-apps
kubectl get secret -n apollo-airlines-apps -l owner=helm
kubectl get deploy booking -n apollo-airlines-apps -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}{" "}{.metadata.annotations.meta\.helm\.sh/release-name}{"\n"}'
helm get values apollo11 -n apollo-airlines-apps
helm get manifest apollo11 -n apollo-airlines-apps | grep -c '^kind: Deployment'
```

3. **Check:**
   - `apollo11  deployed  revision 1`.
   - A Secret `sh.helm.release.v1.apollo11.v1` in the namespace: the release record is just a Secret.
   - `Helm apollo11` on the Deployment; `helm get manifest` lists the 7 Deployments Helm will manage.
4. **Prove it works:**

```bash
bash stages/stage5/scripts/verify.sh --mode helm
```

5. **Why:** Helm = render + apply + store. The stored revision is how it can diff, upgrade and roll back later.
6. **Your turn:** find the exact YAML Helm has stored for revision 1, and prove it matches what is live for `booking`'s replica count.

<details>
<summary>Answer</summary>

```bash
helm get manifest apollo11 -n apollo-airlines-apps --revision 1 | grep -A8 'name: booking$' | grep replicas
kubectl get deploy booking -n apollo-airlines-apps -o jsonpath='{.spec.replicas}{"\n"}'
```
</details>

---

## Exercise 3: Break it: a bad upgrade that Helm calls successful

**Concepts:** [Promotion and rollback](./learn/delivery/promotion-and-rollback) · [Rollouts and rollback](./learn/workloads/rollouts-and-rollback)

**Goal:** see that `deployed` means "applied", not "healthy", and use rollback and `--atomic` correctly.
**Time:** ~15 min · **Needs:** Exercise 2 state.

### 3A: a good upgrade, then roll back

1. **Predict:** you upgrade with `--set apps.booking.replicas=3`. What does `helm history` show after you roll back to revision 1?
2. **Do:**

```bash
C=stages/stage5/helm/apollo11; NS=apollo-airlines-apps
helm upgrade apollo11 $C -f $C/values-dev.yaml --set apps.booking.replicas=3 -n $NS --wait --timeout 120s
kubectl get deploy booking -n $NS
helm rollback apollo11 1 -n $NS --wait
kubectl get deploy booking -n $NS
helm history apollo11 -n $NS
```

3. **Check:** replicas `3/3`, then `1/1`. History: revision 3 is "Rollback to 1", with revisions 1 and 2 `superseded`. A rollback creates a **new** revision; nothing is deleted.

### 3B: a bad image tag

1. **Predict:** you upgrade the whole chart to a tag that does not exist, **without** `--wait`. What status does Helm report, and what do users see?
2. **Inject:**

```bash
helm upgrade apollo11 $C -f $C/values-dev.yaml --set image.tag=v999-missing -n $NS
helm status apollo11 -n $NS | grep -E 'STATUS|REVISION'
sleep 30
kubectl get pods -n $NS | grep -E 'ImagePull|ErrImage'
```

3. **Symptom:** Helm says `STATUS: deployed` (revision 4). Meanwhile new Pods are in `ErrImagePull`/`ImagePullBackOff`. Old Pods still serve (rolling update, Stage 1).
4. **Diagnose:** Helm reports that the API accepted the objects. Health is a separate question:

```bash
kubectl rollout status deploy/booking -n $NS --timeout=10s ; true
kubectl describe pod -n $NS -l app=booking | grep -E 'Failed to pull|Back-off' | head -3
```

5. **Fix and prove:** roll back to the last revision that was healthy (read it from `helm history`; in this sequence revision 3, the rollback to 1, is the good one; revision 4 is the bad upgrade).

```bash
helm history apollo11 -n $NS
helm rollback apollo11 3 -n $NS --wait
helm history apollo11 -n $NS | tail -3
kubectl rollout status deploy/booking -n $NS
```

   - A new revision 5 appears ("Rollback to 3"). Booking is `1/1` on `:latest`.
6. **Try the safe flag:**

```bash
helm upgrade apollo11 $C -f $C/values-dev.yaml --set image.tag=v999-missing -n $NS --atomic --timeout 60s
helm history apollo11 -n $NS | tail -3
```

   - After ~60 s Helm reports the upgrade failed and **rolls back automatically**. History shows `failed` for the bad revision then a rollback revision. The cluster ends healthy.
7. **Why:**

| Flag | Helm waits for readiness? | On failure |
|---|---|---|
| (none) | No | Reports `deployed` regardless |
| `--wait` | Yes, up to `--timeout` | Release `failed`, nothing reverted |
| `--atomic` (implies `--wait`) | Yes | Release `failed`, then automatic rollback |

   - In CI, use `--atomic`. Without it, a green pipeline can mean a broken app.
8. **Your turn:** the Secret and ConfigMap values in the chart come from `values.yaml`. Use `helm get values --all` to see which tag the release is using now, and explain why `helm rollback` does not undo a database row that the bad version wrote.

<details>
<summary>Answer</summary>

Rollback restores Kubernetes objects from the stored manifest. Data written to Postgres lives outside Helm's record, so it is untouched in both directions.
</details>

---

## Exercise 4: Kustomize: patch existing YAML, and write an overlay yourself

**Concepts:** [Kustomize comparison](./learn/delivery/kustomize-comparison)

**Goal:** render an overlay, then author your own, and see what a bad path looks like.
**Time:** ~12 min · **Needs:** nothing running.

1. **Predict:** how does Kustomize change `replicas` for booking, without any `{{ }}`?
2. **Do:**

```bash
kubectl kustomize stages/stage5/overlays/dev  > /tmp/k-dev.yaml
kubectl kustomize stages/stage5/overlays/prod > /tmp/k-prod.yaml
diff /tmp/k-dev.yaml /tmp/k-prod.yaml | grep -E '^[<>] +(replicas|image):|environment:' | sort | uniq -c
sed -n 1,40p stages/stage5/overlays/dev/kustomization.yaml
```

3. **Check:** differences are `replicas`, `image` tags and the `environment` label. The overlay file contains a `replicas:` list and `images:` entries, which patch the base objects in `overlays/base`.
4. **Author your own overlay:**

```bash
mkdir -p learner-work/stage5/overlay
cat > learner-work/stage5/overlay/kustomization.yaml <<'YAML'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../../stages/stage5/overlays/dev
replicas:
  - name: booking
    count: 3
labels:
  - pairs: {owner: me}
    includeSelectors: false
YAML
kubectl kustomize learner-work/stage5/overlay > /tmp/k-mine.yaml
diff /tmp/k-dev.yaml /tmp/k-mine.yaml | head
```

   - Booking `replicas: 3` and `owner: me` on every object; nothing else changes.
5. **Break: a wrong path**

```bash
sed -i 's#overlays/dev#overlays/devv#' learner-work/stage5/overlay/kustomization.yaml
kubectl kustomize learner-work/stage5/overlay 2>&1 | head -3
sed -i 's#overlays/devv#overlays/dev#' learner-work/stage5/overlay/kustomization.yaml
```

   - `accumulating resources … no such file or directory`: Kustomize fails fast and names the path. Fixed by reverting.
6. **Why:**

| | Helm | Kustomize |
|---|---|---|
| Input | Templates + values | Real YAML + patches |
| Logic (if/loops) | Yes | No |
| Release record / rollback | Yes | No (Git history is the record) |
| Typical use | Package others install | Environment differences in one repo |

7. **Your turn:** apply your overlay to a throwaway namespace is not safe (it hard-codes namespaces). Instead use `kubectl diff -k`-style reasoning: which of Helm or Kustomize can tell you *that a rollout will happen* before you apply, and with which command?

<details>
<summary>Answer</summary>

Either can render; to compare against live state use `kubectl diff -k <overlay>` for Kustomize and the `helm-diff` plugin for Helm. Both only show differences; neither applies.
</details>

---

## Exercise 5: Same app, plain manifests: switch installers safely

**Concepts:** [Rendering and Helm](./learn/delivery/rendering-and-helm) · [Kustomize comparison](./learn/delivery/kustomize-comparison)

**Goal:** move from the Helm release to the Kustomize path and see that ownership, not YAML, changes.
**Time:** ~10 min

1. **Predict:** you remove Helm's release, then apply the Kustomize dev overlay. After the switch, does `helm list` show anything? What labels are on the Deployment?
2. **Do:**

```bash
bash stages/stage5/scripts/teardown.sh --mode helm
bash stages/stage5/scripts/apply.sh --mode kustomize --env dev --skip-build
helm list -A
kubectl get deploy booking -n apollo-airlines-apps --show-labels | tr ',' '\n' | grep -E 'managed-by|environment'
bash stages/stage5/scripts/verify.sh --mode kustomize
```

3. **Check:** `helm list` is empty; the Deployment has `environment=dev` and **no** `managed-by=Helm`.
4. **Why:** the final objects look similar; what differs is who can update them (`helm upgrade` versus `kubectl apply -k`) and where history lives. Mixing installers on the same objects causes ownership conflicts: always tear down before switching.
5. **Your turn:** compare the two `booking` Deployments you rendered in Exercises 1 and 4 and name two fields that differ even though both claim "dev". Which one would you trust to match production, and why?

<details>
<summary>Answer</summary>

Typically labels, annotations and sometimes probe or resource blocks, because the Helm templates and the Kustomize base are maintained separately. Keeping one source of truth (one tool per environment) removes that drift.
</details>

---

## Exercise 6 (optional): Argo CD enforces Git, not you

**Concepts:** [GitOps and ownership](./learn/delivery/gitops-and-ownership)

**Goal:** show Argo CD reverting a manual change, and show where it stops.
**Time:** ~20 min · **Needs:** all other installers torn down (`teardown.sh --mode kustomize`); more memory than earlier exercises.

1. **Predict:** you scale a managed Deployment by hand. Who wins, and how long does it take?
2. **Do:**

```bash
bash stages/stage5/argocd/install.sh
bash stages/stage5/argocd/scripts/bootstrap.sh --sync
kubectl get application -n argocd
kubectl get application -n argocd -o custom-columns=NAME:.metadata.name,AUTO:.spec.syncPolicy.automated,SYNC:.status.sync.status,HEALTH:.status.health.status
helm list -A
```

3. **Check:**
   - `apollo11-dev` and `-staging`: `Synced`, `Healthy`, `AUTO` populated. `apollo11-prod`: `AUTO <none>` (manual sync only, by design).
   - `helm list -A` shows **no** `apollo11-dev` release: Argo renders the chart itself and applies the result, it does not create Helm releases.
4. **Inject drift:**

```bash
D="kubectl get deploy booking -n apollo-airlines-dev-apps"
kubectl scale deploy/booking -n apollo-airlines-dev-apps --replicas=5
$D -o jsonpath='{.spec.replicas}{"\n"}'
kubectl get application apollo11-dev -n argocd -w     # Ctrl-C when it returns to Synced
$D -o jsonpath='{.spec.replicas}{"\n"}'
```

5. **Symptom/Fix:** `OutOfSync` appears, then replicas return to **1**. Argo's self-heal ran within ~3 min (its polling interval). You did not fix anything; Git (via `values-dev.yaml`) did.
6. **Second drift: delete an object**

```bash
kubectl delete svc booking -n apollo-airlines-dev-apps
sleep 10; kubectl get svc booking -n apollo-airlines-dev-apps
```

   - Recreated: self-heal restores deleted resources, not just changed fields. (If it hasn't appeared, wait up to ~3 min.)
7. **Why:**
   - Reconciliation loop = compare Git ↔ live; on difference, report (`OutOfSync`) and, if allowed, correct.
   - Prod omits `automated`: a human reviews the diff before sync, trading speed for control. `kubectl edit` during an incident stays in place until someone syncs.
8. **Your turn:** to make a permanent change to dev replicas the Argo way, what do you edit and where? Why would `kubectl scale` never be the answer here?

<details>
<summary>Answer</summary>

Edit `apps.booking.replicas` in `values-dev.yaml` (or the Application's `helm.parameters`) and commit it to the tracked Git repo; Argo then applies it. Manual `kubectl scale` is reverted because the desired state lives in Git.
</details>

---

## Clean-up

```bash
bash stages/stage5/argocd/uninstall.sh                   # if you ran Exercise 6
bash stages/stage5/scripts/teardown.sh --mode kustomize  # or --mode helm
rm -rf learner-work/stage5
```

## You can now

- [ ] Compare two environments by diffing renders, and trace a value to a field.
- [ ] Say why `helm status: deployed` is not "healthy", and choose `--wait` / `--atomic`.
- [ ] Write a Kustomize overlay and read its errors.
- [ ] Explain what Argo CD reverts, what it does not (prod), and why Git is the only edit point.

## Checkpoint

1. Where does Helm store revision history?
2. What does `helm rollback` restore, and what does it leave alone?
3. Why does the Kustomize path have no rollback command?
4. Which edit survives Argo CD self-heal: `kubectl scale`, or a commit to Git?

Next: [Stage 6: Mission Operations](./stage-6).
