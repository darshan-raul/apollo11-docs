---
title: Horizontal Pod Autoscaling
---

# Horizontal Pod Autoscaling

The metrics pipeline supplies observations; an HPA computes a desired replica recommendation and updates its target workload. CPU utilization is relative to requested CPU, so requests materially change its meaning. Missing metrics, readiness, limits, and available cluster capacity can prevent the expected result. Downscale stabilization considers recent recommendations, not a fixed sleep.

## In the Orbital Maneuvering mission

The metrics pipeline supplies observations to an HPA, which computes a desired
replica recommendation and updates its target workload. CPU utilisation is
relative to the Pod’s requested CPU, so changing the request changes the meaning
of the same observed use. More desired replicas still need schedulable capacity.

## Evidence and limit

Inspect metrics availability, HPA conditions, recommendations, target replicas,
and Pod scheduling. Downscale stabilization considers recent recommendations to
avoid rapid shrinking; it is not a fixed sleep after demand falls.

## Follow the controller chain

Metrics provide an observation. The HPA turns that observation into a desired
replica recommendation and updates its target Deployment. CPU utilisation uses
the requested CPU as its denominator, so resource requests change what the same
usage means. New replicas still need schedulable node capacity.

## Evidence and limits

Inspect metric availability, HPA conditions, recommendation history, target
replicas, Pod scheduling, and application behaviour. Downscale stabilization
uses recent recommendations; it is not a simple timer.
