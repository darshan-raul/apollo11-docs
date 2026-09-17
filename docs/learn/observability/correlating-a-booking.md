---
title: Correlating a booking
---

# Correlating a booking

To investigate one booking, start with its request identifier or trace, inspect the relevant logs, and then compare metrics around the same interval. Correlation narrows a hypothesis; it does not prove causality without checking the specific dependency, configuration change, and runtime evidence.

## In the Mission Operations story

Start a booking investigation with an identifier or trace, then connect it to
the relevant service logs and metric interval. If booking waits on flight, the
trace gives the request path, logs can show the detailed error, and a metric can
say whether that pattern affected one passenger or many.

## Evidence and limit

Correlation narrows a hypothesis. Confirm configuration changes, dependency
health, and runtime events before naming a cause. Timing alone can be suggestive
without proving which component created the behaviour.

## Build the explanation in layers

Start with a booking identifier or trace. Use the trace to see the cross-service
shape, logs to inspect a particular error, and metrics to learn whether the same
pattern affected many requests. Compare their timestamps and deployment revision
before choosing a cause.

## Evidence and limits

Correlation narrows a hypothesis; it is not causation. Confirm dependency health,
configuration, rollout events, and application behaviour. Preserve the evidence
that distinguishes one slow booking from a system-wide regression.
