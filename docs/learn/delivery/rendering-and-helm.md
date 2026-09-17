---
title: Rendering and Helm
---

# Rendering and Helm

Helm renders templates and values into Kubernetes objects, then records release metadata. Rendered output is the object graph a cluster receives; a release record is Helm’s own history. A version-looking tag is not automatically immutable. Render and inspect the exact values before applying them.

## In the Payload Integration mission

Helm starts from templates and values, then renders ordinary Kubernetes objects.
Those rendered objects are what the cluster receives. Helm also keeps a release
record for its own history, which is useful but not the same thing as the
resource graph itself. Read the render before apply: it reveals image references,
names, selectors, and values that a chart abstraction can otherwise hide.

## Evidence and limit

A successful render proves templates can be expanded with those values. A
successful release command proves Helm completed its configured action. Neither
proves a node pulled the image, a rollout became ready, or a passenger can book.

## Follow one release toward the cluster

Suppose Apollo changes the booking image and wants a different replica count in
the development environment. Helm combines chart templates with values and
renders ordinary Kubernetes objects. Those objects are the desired graph that
the API server will receive. Helm may also store a release record describing its
own operation; that history is useful, but it is not the running application.

Read rendered output before applying it. Find the image reference, names,
selectors, namespaces, probes, and resource values. A small value change can
alter the graph in ways a chart command hides.

## Evidence and limits

A successful render proves that the templates and values produced YAML. A
successful install or upgrade proves Helm completed its configured action.
Deployment conditions, Pod readiness, and a passenger request are needed to
show convergence and useful behaviour. A version-shaped image tag is not
immutable simply because it looks like a release number.
