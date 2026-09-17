---
title: CI and image delivery
---

# CI and image delivery

A delivery chain should trace source revision, validation, image build, image digest publication, and the desired manifest reference. A CI success proves its configured checks passed. It does not prove a cluster pulled the artifact, rolled it out, or served useful traffic.

## In the Payload Integration mission

A source change becomes a candidate release through several handoffs: validation,
image build, artifact publication, and a manifest that names the chosen artifact.
Keep the source revision and image digest connected so an operator can answer
which code a booking Pod was asked to run.

## Evidence and limit

A green CI job proves its configured checks passed for a source revision. It does
not prove that the cluster can pull the artifact or that the application serves
correct traffic. A human-looking version tag is a label; it is immutable only
when the registry and delivery policy make it so.

## Follow the artifact, not just the job

A source change becomes a release through a chain: checks run, an image is built,
the artifact is published, and desired configuration names what should run.
Apollo can only explain a deployed booking when those handoffs remain connected
to the source revision and, ideally, an image digest.

## Evidence and limits

A green CI run is evidence for the checks that job actually performed. Inspect
the published artifact and rendered reference before attributing code to a Pod.
Then inspect image pull, rollout, and application behaviour. CI cannot prove a
cluster pulled the image or that a passenger can complete a booking.
