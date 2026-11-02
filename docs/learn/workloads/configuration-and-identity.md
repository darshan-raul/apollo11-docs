---
title: "Configuration and identity"
description: "How ConfigMaps, Secrets and ServiceAccounts reach a Pod: environment variables versus mounted files, when a change is noticed, what a Secret does and does not protect, and what a ServiceAccount token is for."
---

# Configuration and identity

*Stage 1 · Liftoff*

**You will be able to:** inject settings as environment variables or files and predict when each sees a change, explain what a Secret protects and what it does not, find the places where a secret leaks past its Secret, and say what a ServiceAccount token is for and why Apollo turns it off.

Launchpad's [images and configuration](../containers/images-and-configuration) chapter kept environment facts out of the image: one booking image, different settings per environment. Compose put those settings in an `environment:` block next to each service. Kubernetes moves them into **objects of their own**, so the same values can be shared by many Deployments, changed without editing a workload, and protected separately. A Pod also needs one more thing Compose never asked about: an identity for when it talks to the Kubernetes API.

## Three objects a Pod reads from outside its image

| Object | Holds | Read by | Apollo example |
|---|---|---|---|
| **ConfigMap** | Non-sensitive key/value settings | The container, as env vars or files | `apollo-airlines-config`: ports, service URLs, database names |
| **Secret** | Sensitive key/value data | The container, as env vars or files | `apollo-airlines-secrets`: `POSTGRES_PASSWORD`, `JWT_SECRET` |
| **ServiceAccount** | A named identity | The Kubernetes API, when the Pod calls it | `booking`, `init-booking-db`, … (13 in total) |

All three are namespaced: a Pod can only reference ones in its own namespace. Each ConfigMap or Secret is limited to 1 MiB, so they hold settings and small files, not datasets.

## Two ways in: environment or files

The Pod spec decides how values arrive. There are two routes, and they behave very differently when the source changes.

```mermaid
flowchart LR
  CM["ConfigMap<br/>apollo-airlines-config"]
  subgraph Pod
    direction TB
    E["env: FLIGHT_SERVICE_URL<br/>(copied once at start)"]
    F["/etc/app/FLIGHT_SERVICE_URL<br/>(file, kept in sync)"]
  end
  CM -->|"configMapKeyRef / envFrom"| E
  CM -->|"configMap volume"| F
```

**Environment variables.** The kubelet reads the object when it starts the container and copies the values into the process environment.

```yaml
env:
  - name: FLIGHT_SERVICE_URL          # one key, renamed if you like
    valueFrom:
      configMapKeyRef: {name: apollo-airlines-config, key: FLIGHT_SERVICE_URL}
envFrom:                               # or every key in the object at once
  - configMapRef: {name: apollo-airlines-config}
```

**Files.** A `configMap` or `secret` volume turns each key into a file whose content is the value.

```yaml
volumes:
  - name: settings
    configMap: {name: apollo-airlines-config}
containers:
  - volumeMounts:
      - {name: settings, mountPath: /etc/app, readOnly: true}
```

| | Environment variable | Mounted volume | Volume with `subPath` |
|---|---|---|---|
| Sees a later edit? | **Never.** Copied once at container start | **Yes, eventually** (typically within a minute or two) | **Never** |
| How the app sees it | Reads its environment at start | Must re-read the file | Reads one fixed file |
| To apply a change | Start new Pods: `kubectl rollout restart` | Make the app reload, or restart | Start new Pods |
| Good for | Simple settings, 12-factor apps | Config files, certificates, values that rotate | Dropping one file into a directory that already has others |

### How a mounted file changes safely

The kubelet does not edit files in place. It writes the new values to a fresh timestamped directory, then swaps a single symlink (`..data`) to point at it. Every key's file is a link through `..data`, so a reader sees either the complete old set or the complete new set, never half of each. A `subPath` mount bypasses that symlink and pins one file, which is why it never updates.

### Missing values stop the container

If a referenced ConfigMap, Secret or key does not exist, the kubelet will not start the container. The Pod shows `CreateContainerConfigError` and an event naming the missing object. It keeps retrying, and starts as soon as the object appears. Mark a reference `optional: true` only when the app genuinely works without it.

### Building one value from another

An `env` value can reference an earlier variable as `$(NAME)`. Kubernetes expands it when it starts the container:

```yaml
env:
  - name: POSTGRES_PASSWORD
    valueFrom: {secretKeyRef: {name: apollo-airlines-secrets, key: POSTGRES_PASSWORD}}
  - name: DATABASE_URL                 # must come after POSTGRES_PASSWORD
    value: "postgresql://postgres:$(POSTGRES_PASSWORD)@booking-db:5432/booking"
```

Only variables defined **earlier in the same list** are expanded. A reference that cannot be resolved is left as the literal text `$(NAME)`, with no error, and the app fails later with a confusing connection message.

## What a Secret is, and is not

A Secret is a separate kind so that access to it can be controlled separately from ConfigMaps. In the Kubernetes API the two are almost identical. The differences:

| | ConfigMap | Secret |
|---|---|---|
| Stored as | Plain text | **Base64-encoded** in `data`; `stringData` accepts plain text on write |
| Readable by | Whoever RBAC allows | Whoever RBAC allows, usually a narrower set |
| On the node | Files on disk | Files in memory (`tmpfs`), only on nodes running a Pod that uses it |
| Types | One | `Opaque`, `kubernetes.io/tls`, `kubernetes.io/dockerconfigjson`, … (the type checks required keys) |

Base64 is an encoding for arbitrary bytes, not encryption: `base64 -d` reverses it. By default a Secret is also stored unencrypted in etcd, is not rotated, and is not hidden from an app that logs its environment. And a quieter rule: **anyone who can create a Pod in a namespace can mount any Secret in that namespace** and print it. RBAC on Secrets only helps if Pod creation is controlled too.

So "put it in a Secret" is necessary, not sufficient. Stage 8 adds RBAC, encryption at rest and an external store ([Secrets and supply chain](../security/secrets-and-supply-chain)).

## ServiceAccounts: who the Pod is to the API

A **ServiceAccount** is an identity for processes, the way a user account is for people. Every namespace has one called `default`, and a Pod that names none runs as it.

Unless told otherwise, the kubelet mounts a short-lived token for that identity at `/var/run/secrets/kubernetes.io/serviceaccount/token`, next to the cluster's CA certificate and the namespace name. The token is **bound to the Pod**: it expires (about an hour, refreshed by the kubelet) and stops working when the Pod is deleted. Any process in the container can present it to the API server.

| The token is | The token is not |
|---|---|
| Proof of identity to the **Kubernetes API** | A database login or a credential for peer services |
| Only as powerful as the RBAC rules bound to the ServiceAccount | Harmless: `default` may be granted rights later by someone else |

Apollo's services talk to databases and each other, never to the Kubernetes API. Mounting a credential they never use only helps an attacker who breaks into a web-facing process. So every Apollo ServiceAccount sets `automountServiceAccountToken: false`. The Pod spec can override that field, and the Pod's setting wins.

Labels are not identity. `app: booking` is mutable metadata anyone with edit rights can copy onto another Pod. The ServiceAccount is what the API's authorization layer evaluates.

## Apollo example

From [Stage 1's manifests](https://github.com/darshan-raul/Apollo11/tree/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage1/k8s):

| What | How it is delivered | Note |
|---|---|---|
| Backend URLs and ports | `configMapKeyRef`, key by key | Booking reads only the four keys it needs |
| Frontend settings | `envFrom` the whole ConfigMap | Simple, but the frontend also receives every other service's keys |
| `JWT_SECRET` | `secretKeyRef` | Same key for identity (signs tokens) and flight and booking (verify them) |
| `POSTGRES_PASSWORD` in databases and init Jobs | `secretKeyRef` | |
| Password in each app's `DATABASE_URL` | **A literal `value`**: `postgresql://postgres:postgres@…` | A gap: see below |
| `init.sql` for each database | `configMap` volume at `/init` | A file, because `psql -f` wants one |
| 13 ServiceAccounts | `serviceAccountName` per workload | All with `automountServiceAccountToken: false` |

The `DATABASE_URL` row is worth noticing. In Stages 1 to 4 the identity, flight and booking Deployments repeat the database password inside a plain URL. Changing `POSTGRES_PASSWORD` in the Secret would change the databases and the init Jobs but not the apps, and anyone who can read a Deployment can read the password. Stage 5 fixes it with the `$(POSTGRES_PASSWORD)` expansion shown above, so the Secret is the only copy.

## Try it

:::caution[Unverified]
Not yet run on a live cluster for this documentation revision. Uses a throwaway namespace on any cluster.
:::

Watch an environment variable and a mounted file react differently to the same edit:

```bash
kubectl create namespace cfg-demo
kubectl -n cfg-demo create configmap app-config --from-literal=GREETING=hello
kubectl -n cfg-demo apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: reader}
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sleep", "3600"]
      env:
        - name: GREETING
          valueFrom: {configMapKeyRef: {name: app-config, key: GREETING}}
      volumeMounts:
        - {name: cfg, mountPath: /etc/app}
  volumes:
    - name: cfg
      configMap: {name: app-config}
EOF
kubectl -n cfg-demo wait --for=condition=Ready pod/reader

kubectl -n cfg-demo patch configmap app-config -p '{"data":{"GREETING":"goodbye"}}'
sleep 90
kubectl -n cfg-demo exec reader -- printenv GREETING       # hello
kubectl -n cfg-demo exec reader -- cat /etc/app/GREETING   # goodbye
kubectl -n cfg-demo exec reader -- ls -la /etc/app         # GREETING -> ..data/GREETING
```

Then look at a Secret and at the token every default Pod carries:

```bash
kubectl -n cfg-demo create secret generic db --from-literal=password=s3cret
kubectl -n cfg-demo get secret db -o jsonpath='{.data.password}'; echo     # czNjcmV0
kubectl -n cfg-demo get secret db -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n cfg-demo exec reader -- ls /var/run/secrets/kubernetes.io/serviceaccount
kubectl -n cfg-demo get pod reader -o jsonpath='{.spec.serviceAccountName}'; echo   # default

kubectl delete namespace cfg-demo
```

- The same edit reached the file but not the variable: the process environment was fixed at start.
- The `..data` symlink is the atomic swap described above.
- The Secret decoded with one command, and the Pod received an API token it never asked for.

## Common misconceptions

- **"Editing the ConfigMap updates my running Pods."** Environment variables never change. Mounted files do, but only an app that re-reads them notices.
- **"A Secret is encrypted."** It is base64-encoded, and by default unencrypted in etcd.
- **"Only people with `get secrets` can read a Secret."** Anyone who can create a Pod in that namespace can mount it.
- **"The ServiceAccount token logs my app into the database."** It authenticates to the Kubernetes API only.
- **"`$(VAR)` works anywhere in `env`."** Only for variables defined earlier in the list; otherwise the literal text is passed through.

## Check yourself

<details>
<summary>You change <code>LOG_LEVEL</code> in a ConfigMap read through <code>envFrom</code>. What happens to running Pods, and how do you apply it?</summary>

Nothing. Environment variables were copied at container start. Start new Pods with `kubectl rollout restart deploy/<name>`.
</details>

<details>
<summary>A Pod is stuck in <code>CreateContainerConfigError</code>. What is the first thing to check?</summary>

`kubectl describe pod` events: a referenced ConfigMap, Secret or key does not exist. The container starts once it is created.
</details>

<details>
<summary>Why does a file mounted with <code>subPath</code> never update?</summary>

It is bound to one file at container start, bypassing the `..data` symlink that the kubelet swaps when the source changes.
</details>

<details>
<summary>You rotate <code>POSTGRES_PASSWORD</code> in Stage 1's Secret and restart everything. Why can booking still not reach its database?</summary>

Booking's `DATABASE_URL` hard-codes the old password as a literal value. The Secret is not its only source. Stage 5 builds the URL from the Secret with `$(POSTGRES_PASSWORD)`.
</details>

## Where this leads

Configuration reaches long-running Pods. Some work should run once and finish instead, such as creating database tables: [Jobs and initialization](./jobs-and-initialization).

## References

- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/) and [good practices for Secrets](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
- [Define dependent environment variables](https://kubernetes.io/docs/tasks/inject-data-application/define-interdependent-environment-variables/)
- [Service accounts](https://kubernetes.io/docs/concepts/security/service-accounts/)
