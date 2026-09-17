---
title: Signals and metrics
---

# Signals and metrics

Metrics summarize numerical behavior; logs preserve discrete events; traces connect work across boundaries. Choose the signal based on the question. A counter is monotonic until reset, so rate over time is usually more meaningful than its raw value. Histograms support distributions; labels help slice data but high-cardinality labels can make storage and queries expensive.

## In the Mission Operations story

Metrics answer questions about patterns: how many booking requests arrived, how
long they took, and how often they failed. Logs preserve individual messages,
while traces carry one request’s context across services. A counter is most
useful as a rate over an interval because it can reset. A histogram records a
distribution, which supports latency questions that one average would hide.

## Evidence and limit

Labels let you slice a metric by useful dimensions such as service or status.
They also create series, so unbounded values such as booking IDs are dangerous
labels. A chart is only as trustworthy as the collection and query behind it.

## Start with the question

If a passenger says booking is slow, a raw dashboard is not a diagnosis. Metrics
help describe rate, errors, latency, and saturation across many requests. Logs
preserve individual events. Traces connect spans for one request as it crosses
booking, identity, flight, and notification.

Counters accumulate until they reset, so a rate over a window usually answers a
traffic question better than the raw counter. Histograms retain buckets of
observations, which makes tail latency visible in a way an average can hide.

## Evidence and limits

Choose labels that describe bounded dimensions such as service or response class.
A booking ID as a label can create an unbounded number of time series. A chart
only supports a claim when its target was discovered, its scrape succeeded, and
the query uses the intended time window.
