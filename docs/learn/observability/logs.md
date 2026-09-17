---
title: Logs
---

# Logs

Logs are event records emitted by applications and infrastructure. Include stable request or trace identifiers where possible, avoid secrets, and distinguish ingestion success from useful structured context. A log line can explain one event but cannot safely establish fleet-wide rate or latency.

## In the Mission Operations story

Logs preserve individual events close to the application that observed them. A
booking log can include a stable request or trace identifier, the operation, and
a useful error context. Those details let an operator connect an event to a
trace without copying credentials or personal data into a log stream.

## Evidence and limit

A log record can explain one failure but cannot establish fleet-wide latency or
error rate. Check that logs were collected, indexed, and connected to the
relevant time window before drawing conclusions from their absence.

## Give a booking event a useful shape

A booking log should help an operator locate one operation without exposing
credentials or unnecessary passenger data. A timestamp, service, operation,
outcome, and request or trace identifier can connect a local event to the rest of
the investigation. Structured fields make that connection easier to query than
a sentence that changes shape on every release.

## Evidence and limits

One log line can explain what one process observed. It cannot establish fleet-wide
error rate or prove that no other request failed. An empty search may mean the
event never happened, collection is broken, indexing is delayed, or the query
used the wrong identifier.
