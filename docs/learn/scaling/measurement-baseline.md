---
title: Measurement before optimization
---

# Measurement before optimization

Before changing cache policy, replicas, or resources, define a repeatable workload, baseline, success metric, environment, and comparison window. Record errors and saturation alongside latency. A single faster request or an X-Cache header does not establish a performance result.

## In the Orbital Maneuvering mission

Before changing Apollo, choose a repeatable workload, environment, time window,
and success measure. Capture errors, throughput, latency, and saturation
alongside the metric you hope to improve. Then change one mechanism and compare
like with like. This is how a performance observation becomes a useful result.

## Evidence and limit

A single faster response or an X-Cache header is an anecdote. It does not show
the load shape, tail latency, error rate, or cost of the change.

## Design the comparison

Choose one workload shape, environment, time window, and success measure. For
Apollo search, record request rate, error rate, latency distribution, backend
work, and resource saturation. Change one mechanism at a time so a faster result
has an explanation attached to it.

## Evidence and limits

An X-Cache header or one fast curl is a clue, not a performance result. Keep the
load shape and comparison window so another person can repeat the observation.
