---
title: "Falco — Runtime Detection"
---

# Falco: observe a harmless runtime event

:::info[Optional standalone mission]
Source: [`stages/stage10/missions/falco`](https://github.com/darshan-raul/Apollo11/tree/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage10/missions/falco). Start in the pinned Apollo11 repository root. Later commands run from the mission directory. Each mission creates its own disposable cluster and private kubeconfig; this is independent of the untrusted legacy Stage 10 tree.
:::

Optional Stage 10 security mission after the Stage 8 security concepts.
The standalone mechanism lab can be rehearsed earlier, but is not evidence that
Stage 8 itself is complete. Requires Linux, Docker, kind, Helm, kubectl and a
kernel supporting modern eBPF. Budget about 1 GiB additional free RAM (estimate).
Falco requires host-level visibility: use this dedicated disposable cluster.
Containerized kind nodes still share the host kernel.

## Build and inspect

Open a dedicated Bash shell first. Its directory and `KUBECONFIG` changes
stay inside that shell; keep it open through cleanup. If you stop early, run
`bash teardown.sh` from the mission directory before leaving it.

```bash
bash
cd stages/stage10/missions/falco
bash apply.sh
export KUBECONFIG="$PWD/.kubeconfig"
kubectl -n falco get pods -o wide
kubectl -n falco logs -l app.kubernetes.io/name=falco -c falco --tail=80
```

The pinned Falco Helm chart is 9.2.1. Its modern eBPF driver observes system calls.
`values.yaml` adds a narrow rule matching writes to `/tmp/apollo-falco-marker`.
Kubernetes metadata collection is disabled because this experiment only requires
process, file and container fields. Read the startup log and confirm rule loading
and driver startup before interpreting an absence of alerts.

If modern eBPF cannot start, retain the error and stop the experiment. Do not
silently switch drivers or report a detection pass. Teardown still works.

## Break, inspect, recover

```bash
bash verify.sh | tee verification.log
```

The verifier creates the harmless marker inside a BusyBox Pod, requires a new
`Apollo harmless marker` event, proves the write succeeded, removes the marker,
and proves its absence. Falco detects the action; it does not block it.

For a manual experiment:

```bash
kubectl exec apollo-marker -- sh -c 'echo harmless > /tmp/apollo-falco-marker'
kubectl -n falco logs -l app.kubernetes.io/name=falco -c falco --since=1m
kubectl exec apollo-marker -- rm /tmp/apollo-falco-marker
```

To demonstrate a detection blind spot, save `values.yaml`, change the rule's
path to `/tmp/apollo-other-marker`, and apply the chart again:

```bash
helm upgrade falco falco --repo https://falcosecurity.github.io/charts \
  --version 9.2.1 -n falco -f values.yaml --wait --timeout 5m
```

Generate the original marker again and inspect only new events: that specific
rule should not match. Restore the original values, repeat the upgrade, and
require `bash verify.sh` to pass. Remove both marker files if interrupted.

## Explain and clean up

How does runtime detection differ from admission rejection and NetworkPolicy?
Why does a successful write coexist with an alert? Why must an absent alert be
interpreted alongside driver health, rule conditions and dropped-event metrics?

```bash
bash teardown.sh
kind get clusters
exit                 # return to the parent shell and its original directory/kubeconfig
kubectl config current-context
```

Before `exit`, require `apollo11-falco` to be absent. After `exit`, the context
should match the one used before the mission (or be unset if none existed). Retain your verification log.
[Official deployment guidance](https://falco.org/docs/setup/kubernetes/) documents
the supported Helm path; the Falco Operator is another deployment option but
is not needed for this single-rule exercise.
