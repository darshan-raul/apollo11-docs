---
title: Kustomize comparison
---

# Kustomize comparison

Kustomize transforms a base object graph through overlays; Helm renders parameterized templates. Compare the same object in both tools rather than making broad claims about capability. Both produce desired objects; neither observes runtime health by itself.

## In the Payload Integration mission

Kustomize begins with a base object graph and applies transformations for an
environment. Helm begins with templates and values and renders an object graph.
Both can express a booking Deployment with different image or configuration
choices; the useful comparison is the same final object, not a broad claim that
one tool replaces all the other’s uses.

## Evidence and limit

Inspect the generated YAML and the live object after applying it. Rendering or
transforming desired state does not reconcile drift on its own; that is the work
of a controller such as a GitOps tool.

## Compare the same Apollo object

Kustomize starts with a base object graph and applies overlays for an
environment. Helm starts with templates and values and renders an object graph.
For Apollo, compare the booking Deployment produced by each approach: what image,
namespace, labels, replicas, and configuration does the final YAML request?

This comparison keeps the focus on the object that reaches Kubernetes rather than
on a tool’s marketing boundary. Both tools produce desired state. Neither tool
watches the live cluster for health.

## Evidence and limits

Save the generated output alongside the source revision used to produce it.
Then compare it with the live object and its controller status. A clean
transformation does not mean a rollout is safe, a referenced Secret exists, or a
booking request works.
