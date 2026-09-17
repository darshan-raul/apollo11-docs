---
title: Configuration and identity
---

# Configuration and identity

ConfigMaps distribute non-secret values. Secrets are API objects intended for sensitive values, but they are not encryption, least privilege, or safe logging by themselves. A Pod can consume values as environment variables or mounted files; environment values are read at process start. A ServiceAccount identifies a workload to the API, while labels identify objects for selection—do not conflate them.

## In the Liftoff mission

The booking service needs a database address and other runtime values without
building a different image for every environment. A ConfigMap can supply
ordinary configuration. A Secret is the Kubernetes object intended for sensitive
values. A ServiceAccount gives the Pod an identity for Kubernetes API requests;
labels are still only selection metadata.

## Evidence and limit

Look at how a value reaches the process: environment variables are normally read
at startup, while a mounted file needs application support for reload. A Secret
does not by itself prove encryption at rest, narrow access, safe logging, or
rotation. Those are Command Module questions.
