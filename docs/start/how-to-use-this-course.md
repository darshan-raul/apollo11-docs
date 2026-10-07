---
title: "How to Use This Course"
sidebar_label: "How This Course Works"
description: "Routes, page types, exercise format, and completion criteria."
---

# How to use this course

**You will be able to:** pick a route and know when a stage is done.

## Routes

| Route | Do | Skip | Outcome |
|---|---|---|---|
| Reading only | Briefings + chapters + "Check yourself" | Setup, lab pages | Concepts and trade-offs |
| **Hands-on (recommended)** | Chapters, then the stage lab | Nothing | Builds, breaks, diagnoses and recovers a real cluster |
| Reference | Command reference, troubleshooting, glossary | Order | Look-ups |

## Page types

- **Mission briefing**: the problem, chapter list, readiness check.
- **Chapter**: one concept, as bullets, with a short "Try it".
- **Lab ("Build …")**: exercises run in the `Apollo11` repo.
- **Reference**: look-up only.
- **Planned**: design notes. No runnable lab exists yet.

## How lab exercises work

Each exercise has the same shape:

1. **Predict**: answer in writing before running anything.
2. **Do**: copy-paste commands.
3. **Check**: compare with the expected output.
4. **Break**: inject one specific fault.
5. **Diagnose**: use the evidence ladder and name the failing component before opening the answer.
6. **Fix and prove**: recover, then show recovery with a real request.
7. **Your turn**: one open task, solution hidden.

## Evidence ladder

| Rung | Command | Answers |
|---|---|---|
| 1 Snapshot | `kubectl get <obj> -o wide` | What exists, which node, which IP? |
| 2 Events | `kubectl get events --sort-by=.lastTimestamp` | What did the cluster try? |
| 3 Spec / conditions | `kubectl describe <obj>` | Where did it stop? |
| 4 Logs | `kubectl logs <pod>` | What did the app see? |
| 5 Endpoint | `curl` / `port-forward` | Does the passenger path work? |

## Stage is complete when you can

- **Build**: apply the stage's manifests (author at least one yourself in `learner-work/`).
- **Observe**: show a real response, not just `kubectl get`.
- **Break**: inject the stage's fault and name the evidence.
- **Recover**: restore, then prove it with a request.
- **Explain**: say which component acted and why.

## When a command fails

- `NotFound` → wrong stage, namespace or context. Do not create objects to silence it.
- `connection refused` → wrong address or listener not ready.
- `Pending` / timeout → read events, not another `apply`.
- `verify.sh` passing is maintainer evidence. Your own break/recover is the learning evidence.

Next: [Terminal, Git and YAML](./terminal-git-and-yaml).
