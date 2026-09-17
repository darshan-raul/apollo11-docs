---
title: Discovery and collection
---

# Discovery and collection

A ServiceMonitor describes which targets Prometheus should discover and how to scrape them. Prometheus performs the scrape. A target being discovered, a scrape succeeding, and an alert expression being meaningful are three separate pieces of evidence.

## In the Mission Operations story

A ServiceMonitor tells the Prometheus Operator which Services and endpoints are
intended scrape targets and how to reach their metrics. Prometheus is the actor
that actually performs a scrape and stores samples. This distinction makes a
missing metric easier to investigate: discovery, target health, scrape result,
and query are separate links.

## Evidence and limit

Inspect selected ServiceMonitor labels, Prometheus targets, and scrape errors.
A discovered target is not necessarily a successful scrape, and a successful
scrape does not establish that the application emitted the metric you need.

## Follow the collection chain

A ServiceMonitor is configuration that tells the Prometheus Operator which
Services or endpoints should be discovered and how to scrape them. Prometheus
then performs the scrape and stores samples. The operator describing a target
does not mean Prometheus reached it, and a successful scrape does not mean the
application emitted the metric an operator intended to use.

## Evidence and limits

Check selector matching, generated target configuration, target health, scrape
errors, and the resulting time series. Keep discovery, collection, query, and
alert evaluation as separate steps in an incident explanation.
