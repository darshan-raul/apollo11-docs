---
title: "Stage 6 — Mission Operations: Read the Flight Instruments"
sidebar_label: "Mission briefing"
---

# Stage 6 · Mission Operations: observability

**Problem:** "booking is slow". Pick the signal that answers it.

## Chapters

Builds on Stage 4's [probes](../learn/reliability/probes) (what readiness cannot tell you) and Stage 5's [delivery](../learn/delivery/rendering-and-helm) (the chart the observability stack is added to).

1. [Signals and metrics](../learn/observability/signals-and-metrics): three signals, the time-series model, counters and histograms, cardinality.
2. [How signals leave a service](../learn/observability/instrumenting-services): pull, push and stdout; the Collector; how Alloy reads logs.
3. [Discovery and collection](../learn/observability/discovery-and-collection): ServiceMonitor to Pod targets, target labels, the four links.
4. [Queries, alerts and objectives](../learn/observability/queries-alerts-and-objectives): PromQL, alert states, Alertmanager, SLO and burn rate.
5. [Logs](../learn/observability/logs): structured lines, streams and labels, LogQL, what not to log.
6. [Traces](../learn/observability/traces): spans, propagation, sampling, the path to Tempo.
7. [Correlating a booking](../learn/observability/correlating-a-booking): the triage order, joins, retention, four cases.

## Ready for the walkthrough when you can answer

- Rate and latency vs one event vs one request's route: metric, log or trace?
- Why does Prometheus scrape each booking Pod instead of the booking Service?
- A ServiceMonitor exists but its target is missing. Discovery or scrape?
- Does an alert fix anything? Why does Apollo alert on burn rate in two windows?
- Why is `trace_id` inside the log line rather than a Loki label?
- What breaks a trace in the middle of a call chain?

## Walkthrough

- [Stage 6 walkthrough](../stage-6)
