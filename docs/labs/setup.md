---
title: "Prepare Your Launchpad"
---

# Prepare Your Launchpad

The labs are where Apollo Airlines leaves the page and starts running on your
machine. They are designed to be disposable: use a local kind cluster, take
notes on what you observe, and tear it down when the mission is over. You do not
need any of this to read the course, but a prepared workstation makes the first
experiment much calmer.

## Bring these tools aboard

Install Node.js 20 or later and npm to run this documentation site. For the
Apollo labs, install Docker, kind, kubectl, Helm, curl, and jq. Docker must be
running before kind can create a cluster. The later missions need more memory
than Launchpad: keep roughly 20 GB of free disk and 8 GB of available memory if
you intend to fly through the observability and scaling labs.

Check the tools you installed:

```bash
docker --version
docker ps
kind version
kubectl version --client
helm version
curl --version
jq --version
```

Clone Apollo11 somewhere you can safely change and inspect it. Run each lab from
that repository root, then use the paths named by its stage instructions. The
documentation is the textbook; the sibling application repository is the source
of truth for runnable manifests, scripts, image tags, and observed verification
results.

## Your first pre-flight check

Before creating a cluster, make sure Docker has enough resources and that your
terminal is using the context you expect. A kind cluster is made from Docker
containers, so laptop ports and Docker resources still matter. Do not reuse an
old `apollo11` cluster by accident: either inspect its context and state or
remove it intentionally before a fresh mission.

```bash
kind get clusters
kubectl config current-context
docker ps
```

An apply command means the API accepted requested objects. It does not yet mean
their Pods are scheduled, endpoints are ready, telemetry is collecting, or a
passenger can complete a booking. Every lab begins by gathering that later
evidence.

## Start when the mission calls for it

The [Launchpad lab](../launchpad) is the gentlest first flight. It uses Docker
Compose to make the airline visible before Kubernetes joins the story. Move to
[Ignition](../ignition) when you want a local cluster. Each later stage names
its own starting state and cleanup boundary; follow those rather than mixing
commands from different snapshots.
