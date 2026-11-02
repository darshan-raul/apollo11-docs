---
title: "Jobs and initialization"
description: "Work that should finish: how a Job counts success, retries with backoff and gives up, why its template cannot be edited, how Kubernetes orders start-up (it mostly does not), and why init work must be safe to run twice."
---

# Jobs and initialization

*Stage 1 · Liftoff*

**You will be able to:** choose between a Job, a Deployment and an init container, predict how many Pods a failing Job creates before it gives up, explain why a Job must be deleted to run again, and order start-up work without relying on Kubernetes to do it.

A new database is empty. Before booking can store anything, its tables must exist. Compose mounted `init.sql` into the Postgres container and let the image run it. Kubernetes could do the same, but Stage 1 makes the setup step visible as its own workload, with its own success or failure.

The obvious alternative, letting booking create tables when it starts, goes wrong as soon as there are two replicas. Both start at once and both run `CREATE TABLE`. One fails or leaves a half-built schema, and the symptom is a crash loop in a web service rather than an error on the setup step.

Setup work has a different shape from a web service. It should **finish**, it should happen **once** rather than once per replica, and its failure should be visible **separately** from serving traffic. A Deployment is built for the opposite: it keeps containers running forever and restarts any that exit.

## A controller that counts success

A **Job** runs Pods until a required number of them exit successfully (exit code `0`), then stops. The controller loop is the same as a ReplicaSet's: compare desired with actual, act on the difference. Only the goal differs.

| | Deployment (through a ReplicaSet) | Job |
|---|---|---|
| Desired state | N Pods running | N successful completions |
| A container exits `0` | A failure: restart it | Success: count it |
| A container exits non-zero | Restart it, forever | Retry, up to `backoffLimit`, then mark the Job `Failed` |
| `restartPolicy` | `Always` | `Never` or `OnFailure` (`Always` is rejected) |
| When done | Never done | Condition `Complete` (or `Failed`); Pods stay for their logs |

The parts of a Job spec:

```yaml
apiVersion: batch/v1
kind: Job
metadata: {name: init-booking-db}
spec:
  completions: 1              # successes needed (default 1)
  parallelism: 1              # Pods allowed at once (default 1)
  backoffLimit: 3             # failures tolerated before Failed (default 6)
  activeDeadlineSeconds: 600  # optional: give up after this long, whatever the count
  ttlSecondsAfterFinished: 3600   # optional: delete the finished Job automatically
  template:                   # an ordinary Pod template
    spec:
      restartPolicy: Never
      containers: [...]
```

With `completions: 5` and `parallelism: 2`, the Job keeps two Pods running until five have succeeded. Apollo's Jobs use the defaults: one Pod, one success.

## Retries, backoff and giving up

`restartPolicy` decides **where** a retry happens:

| `restartPolicy` | On failure | What you can inspect |
|---|---|---|
| `Never` | The Job controller creates a **new Pod** | Every failed Pod stays, with its logs |
| `OnFailure` | The kubelet restarts the container **in the same Pod** | Only the current and previous container's logs |

Either way, retries are spaced by an exponential backoff (10 s, 20 s, 40 s, …, capped at six minutes), so a broken Job does not hammer its database. Once the failures exceed `backoffLimit`, the Job stops creating Pods and gets the condition `Failed` with reason `BackoffLimitExceeded`. `activeDeadlineSeconds` is a second, independent limit on total running time, reported as `DeadlineExceeded`.

```mermaid
flowchart LR
  p1["Pod 1<br/>exit 1"] -->|"wait 10s"| p2["Pod 2<br/>exit 1"] -->|"wait 20s"| p3["Pod 3<br/>exit 1"] -->|"wait 40s"| p4["Pod 4<br/>exit 1"] --> f["Job Failed<br/>BackoffLimitExceeded"]
```

That diagram is Apollo's worst case: `backoffLimit: 3` with `restartPolicy: Never` allows four Pods in total. Each init Pod waits up to 60 seconds for its database (30 tries, 2 s apart) before exiting `1`, so a database that never comes up produces four failed Pods in about five minutes, then a `Failed` Job a person can see.

## A finished Job does not run again

A Job that reached `Complete` stays complete. Nothing re-runs it, even if the database it seeded is wiped later. And you cannot edit it into running again: most of a Job's spec, including its Pod template, is **immutable** after creation. `kubectl apply` with a changed image or command is rejected with `field is immutable`.

To run a Job again, delete it and create it anew. That is exactly what Stage 1's `apply.sh` does every time it runs:

```bash
kubectl delete jobs -n apollo-airlines init-identity-db init-flight-db init-booking-db \
  --ignore-not-found --wait=true
kubectl apply -f stages/stage1/k8s/jobs/init-booking-db.yaml   # and the other two
kubectl wait --for=condition=Complete job/init-booking-db -n apollo-airlines --timeout=180s
```

`ttlSecondsAfterFinished` automates the deletion half. For work on a schedule (nightly cleanup, a daily flight import), a **CronJob** creates a fresh Job from a template at each scheduled time.

## Kubernetes converges; it does not sequence

Compose had `depends_on`. Kubernetes has no equivalent. Apply booking and its database together and both start at once; booking fails readiness until the database answers. Controllers keep retrying until everything agrees with the spec.

That suits long-running services, because readiness keeps traffic away from a Pod until it can serve ([Services and readiness](./services-and-readiness)). It suits one-shot work badly: a Job that starts before its database exists can use up its `backoffLimit` and fail for good. So order is added explicitly, only where it matters:

| Where | How Apollo orders it |
|---|---|
| Stage 1–4 `apply.sh` | Config, then databases (wait for rollout), then Jobs (wait for `Complete`), then apps |
| Inside each Job | An `until pg_isready` loop before running SQL, so starting first is not fatal |
| Inside a Pod | Readiness: a slow dependency delays traffic, not start-up |
| Stage 5 Helm | CRD bundles before the chart, because a chart cannot create a kind that does not exist yet |

A Job does **not** make a Deployment wait for it. If an app version needs a new schema, whatever deploys it must wait for the Job first.

### Init containers: setup inside one Pod

An **init container** is another way to run setup. It is listed under `initContainers` in a Pod spec and runs to completion before the Pod's main containers start; several run one after another. It belongs to one Pod, so it runs for **every** replica and again whenever the Pod is recreated.

| Use | Runs | Good for |
|---|---|---|
| Init container | Before each Pod's containers, every time the Pod starts | Waiting for a dependency, preparing files or permissions for that Pod |
| Job | Once, independently of any app Pod | Creating a schema, seeding, one-off maintenance |

Apollo creates schemas with Jobs, because the work belongs to the database, not to each app replica. [Initialization and seeding](../storage/initialization-and-seeding#where-setup-can-run) in Stage 3 compares every place setup can run once storage outlives Pods.

## Safe to run twice

Retries and reruns mean init work **will** run more than once: after a Pod failed half-way, after `apply.sh` runs again, after a database Pod is replaced. It must be **idempotent**: running it twice leaves the same result as running it once.

| Work | Idempotent form |
|---|---|
| Schema | `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` |
| Seed rows | `INSERT … ON CONFLICT DO NOTHING` (or `DO UPDATE`) |
| Waiting for the database | A bounded retry loop, as in Apollo's Jobs |

`Complete` proves only that a container exited `0`. It does not prove the schema matches the current app, or that any data survived.

## Apollo example

Trimmed from [`init-booking-db.yaml`](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage1/k8s/jobs/init-booking-db.yaml):

```yaml
spec:
  backoffLimit: 3                     # up to 4 Pods in total
  template:
    spec:
      serviceAccountName: init-booking-db
      restartPolicy: Never            # a failed attempt leaves its Pod and logs
      containers:
        - name: init
          image: postgres:15-alpine   # only for psql and pg_isready
          command: [sh, -c, |
            until pg_isready -h booking-db -U postgres; do ... sleep 2; done   # 30 tries
            psql -v ON_ERROR_STOP=1 -h booking-db -U postgres -d booking -f /init/init.sql]
          env:
            - name: PGPASSWORD
              valueFrom: {secretKeyRef: {name: apollo-airlines-secrets, key: POSTGRES_PASSWORD}}
          volumeMounts: [{name: init-script, mountPath: /init}]
      volumes:
        - name: init-script
          configMap: {name: booking-init-script}    # the SQL, as a file
```

- `ON_ERROR_STOP=1` makes `psql` exit non-zero on the first SQL error. Without it, `psql` reports errors and still exits `0`, and the Job would record success.
- The SQL lives in a ConfigMap mounted as a file ([Configuration and identity](./configuration-and-identity#two-ways-in-environment-or-files)), so the Job uses the stock Postgres image.

## Try it

:::caution[Unverified]
Not yet run on a live cluster for this documentation revision. Uses a throwaway namespace on any cluster; takes about two minutes.
:::

A Job that needs three successes, two at a time:

```bash
kubectl create namespace job-demo
kubectl -n job-demo apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata: {name: batch}
spec:
  completions: 3
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - {name: work, image: busybox:1.36, command: ["sh", "-c", "echo working on $HOSTNAME; sleep 5"]}
EOF
kubectl -n job-demo get pods -l job-name=batch -w      # two, then the third; Ctrl-C
kubectl -n job-demo get job batch                       # COMPLETIONS 3/3
```

A Job that always fails, and gives up:

```bash
kubectl -n job-demo apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata: {name: broken}
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - {name: work, image: busybox:1.36, command: ["sh", "-c", "echo cannot reach db; exit 1"]}
EOF
sleep 60
kubectl -n job-demo get pods -l job-name=broken          # 3 Pods, all Error
kubectl -n job-demo get job broken -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}'; echo
#   BackoffLimitExceeded
```

Try to change a finished Job:

```bash
kubectl -n job-demo set image job/batch work=busybox:1.37    # rejected: field is immutable
kubectl delete namespace job-demo
```

- Three successes were needed, so three Pods ran, never more than two at once.
- `backoffLimit: 2` allowed three attempts, spaced further apart each time, then the Job stopped.
- The template cannot change; a new run needs a new Job.

## Common misconceptions

- **"A Job runs its Pod exactly once."** It runs Pods until enough succeed, retrying failures. The work must tolerate a repeat.
- **"`Complete` means the database is healthy."** It means one container exited `0`.
- **"The Deployment will wait for the Job."** Nothing waits unless your scripts or tools do.
- **"Re-applying the Job reruns it."** A finished Job is left alone, and a changed one is rejected as immutable. Delete and recreate it.
- **"`backoffLimit: 3` means three attempts."** It means three failures are tolerated: four attempts.

## Check yourself

<details>
<summary>Why is <code>restartPolicy: Always</code> not allowed in a Job?</summary>

The Job's goal is a successful exit. `Always` would restart the container after it exits `0`, so it could never complete.
</details>

<details>
<summary>The booking database never starts. How many <code>init-booking-db</code> Pods appear, and what does the Job report?</summary>

Four: the first attempt plus three retries (`backoffLimit: 3`, `restartPolicy: Never`). Then the Job's `Failed` condition says `BackoffLimitExceeded`.
</details>

<details>
<summary>You fix a typo in <code>init-booking-db.yaml</code>'s command and run <code>kubectl apply</code>. What happens?</summary>

The API server rejects it: the Job's Pod template is immutable. Delete the Job and apply it again, as `apply.sh` does.
</details>

<details>
<summary>Why does Apollo create schemas with a Job instead of an init container in the booking Pod?</summary>

An init container runs once per replica and per Pod restart, so two booking replicas would both run it. The schema belongs to the database and needs to be created once.
</details>

## Where this leads

The airline is running and seeded. The next need is changing it: shipping a new booking version without taking booking down, in [Rollouts and rollback](./rollouts-and-rollback).

## References

- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
- [Init containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)
- [Automatic cleanup for finished Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/ttlafterfinished/)
