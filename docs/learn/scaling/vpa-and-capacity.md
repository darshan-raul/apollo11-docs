---
title: VPA and capacity
---

# VPA and capacity

VPA can recommend resource requests from observed usage. Recommendation-only mode uses spec.updatePolicy.updateMode: Off. Automatic changes can restart or recreate Pods depending on configuration, and HPA plus VPA need compatible metric choices to avoid feedback loops. No autoscaler creates physical capacity unless a node-capacity mechanism exists.

## In the Orbital Maneuvering mission

VPA studies resource use and can recommend requests that better fit a workload.
Recommendation-only mode is expressed as `spec.updatePolicy.updateMode: Off`.
That lets Apollo inspect the recommendation without changing Pods. Automatic
changes can require Pod recreation, so use them with a rollout and availability
plan.

## Evidence and limit

HPA and VPA can interfere when both react to the same CPU signal. Node capacity
is another constraint: no Pod autoscaler can make a node appear when the cluster
has no feasible place to run it.

## Recommendation before mutation

VPA studies observed usage and can recommend resource requests. Recommendation
only is expressed with updatePolicy and updateMode set to Off. That mode lets an
operator compare the recommendation before changing Pods. Automatic modes can
recreate Pods and need an availability plan.

## Evidence and limits

HPA and VPA can produce competing feedback when they react to the same signal.
Neither autoscaler creates physical capacity when no node can place the desired
Pod.
