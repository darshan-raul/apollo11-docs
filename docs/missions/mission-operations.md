---
title: "Stage 6 — Mission Operations: Read the Flight Instruments"
sidebar_label: "Mission briefing"
---

# Stage 6: Mission Operations — Read the Flight Instruments

A passenger reports that booking is slow. “Look at Grafana” is not yet an
investigation. We need to choose the evidence that answers the question: a
metric for the rate or latency pattern, logs for a discrete event, and a trace
for the causal route through services.

Mission Operations builds those signals one at a time before asking you to join
them around a booking. This is the stage where an operator learns to move from a
symptom to a defensible explanation.

## What you will understand

1. [Signals and metrics](../learn/observability/signals-and-metrics)
2. [Discovery and collection](../learn/observability/discovery-and-collection)
3. [Queries, alerts, and objectives](../learn/observability/queries-alerts-and-objectives)
4. [Logs](../learn/observability/logs)
5. [Traces](../learn/observability/traces)
6. [Correlating a booking](../learn/observability/correlating-a-booking)

A ServiceMonitor describes scrape discovery; Prometheus performs the scrape.
An alert evaluates a condition; it does not repair the system. A trace needs
real context propagation before it can explain a real booking.

## When to take the controls

The [Mission Operations lab](../stage-6) is ready when you can choose a signal
for a question and name the evidence that it was actually collected. Use the
lab to follow a booking across services and test your interpretation.


