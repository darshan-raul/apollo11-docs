---
title: Disruption budgets
---

# Disruption budgets

A PodDisruptionBudget constrains voluntary disruptions such as drain or voluntary eviction by expressing minAvailable or maxUnavailable. It does not stop direct Pod deletion, node failure, OOM termination, or every rollout shape. Its evidence is the allowed-disruptions status, not a claim that all availability failures are prevented.

## In the Flight Control story

A PodDisruptionBudget expresses how many replicas may be unavailable during
voluntary disruption such as node drain or voluntary eviction. It helps an
operator coordinate maintenance with an application’s replica count. It does not
control direct deletion, OOM termination, node failure, or every Deployment
rollout decision.

## Evidence and limit

Look at the PDB’s allowed-disruptions status and the kind of event you are
performing. A budget is a constraint on a narrow class of actions, not an
availability guarantee for the airline.
