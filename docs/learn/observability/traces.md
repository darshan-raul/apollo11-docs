---
title: Traces
---

# Traces

A trace connects spans for one request across services. Propagation only works when callers pass context and receivers continue it. A conceptual booking trace must be labelled conceptual unless it uses Apollo’s actual booking calls and configured instrumentation.

## In the Mission Operations story

A trace is a tree of spans for one request. Booking must pass trace context when
it calls identity, flight, and notification, and those services must continue
that context for the trace to connect. Without propagation, several local spans
do not become an explanation of one passenger journey.

## Evidence and limit

A trace can show where time was observed and which calls happened in one context.
It does not automatically establish that every dependency was represented or
that a slow span caused the passenger-visible symptom; compare it with logs and
metrics.

## Carry one request across services

A trace is a tree of spans for one request. When booking calls identity, flight,
and notification, each caller must pass trace context and each receiver must
continue it. Without that propagation, several timing records may exist without
proving they belong to the same passenger journey.

## Evidence and limits

A trace shows where time was recorded and which instrumented calls participated.
It does not automatically include every dependency, prove a causal root cause,
or demonstrate that an uninstrumented error did not happen. Compare it with logs,
metrics, and the request result.
