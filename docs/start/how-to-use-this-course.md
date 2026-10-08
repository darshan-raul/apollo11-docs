---
title: "How to Use This Course"
sidebar_label: "How This Course Works"
description: "How stages, chapters and walkthroughs fit together, and how each stage builds on the last."
---

# How to use this course

**You will be able to:** follow a stage from its briefing to its walkthrough, and know what "done" means.

## The idea

- Apollo Airlines is deployed again at every stage, each time on a better platform.
- Each stage exists because the previous one hit a limit you can see: data lost on restart, five NodePorts, no way to tell why booking is slow.
- So every stage answers the same three questions:
  1. **What was wrong with the last stage?**
  2. **What do we change, and with which tool?**
  3. **Why is that better, and what is still missing?**

## Each stage has three parts

| Part | What it does | Time |
|---|---|---|
| **Mission briefing** | The problem this stage solves and the chapters to read | 2 min |
| **Chapters** | One concept each, taught from the problem upwards: analogy, mechanism, Apollo example, misconceptions | 10–20 min each |
| **Stage walkthrough** | Deploy the stage from the `Apollo11` repo, step by step, with what each step does, why it's done that way, and how it differs from the previous stage | 30–60 min |

## How a walkthrough reads

- **Where we left off:** the pains carried over from the last stage.
- **What changes in this stage:** a before/after table, row by row.
- **What's in the folder:** every file in `stages/<stage>/`, and what it replaces.
- **Walkthrough:** numbered steps. Each has:
  - the command,
  - a trimmed excerpt of the real YAML or code, with comments,
  - *What happens*, *Why this way*, *Compared with the previous stage*.
- **When something looks wrong:** symptom → likely cause → first command.
- **What this stage does not solve yet:** the limits that motivate the next stage.
- **The journey so far:** one table that grows by a column every stage.

You don't write YAML. The complete manifests, charts and scripts are in the `Apollo11` repo. The walkthrough tells you which file to open and what to notice.

## Routes

| Route | Do | Outcome |
|---|---|---|
| **Hands-on (recommended)** | Briefing → chapters → run the walkthrough | You've seen every layer run, and know why it's there |
| Reading only | Briefing → chapters → read the walkthrough | You know the concepts and the trade-offs |
| Reference | Command reference, troubleshooting, glossary | Look-ups |

## A stage is done when you can

- Bring it up with the stage's script, and show a real request working, not just `kubectl get`.
- Say, for each new object, **what it does** and **what it replaced**.
- Answer the "You should now be able to explain" bullets at the end of the walkthrough without looking.

## Reading the cluster: the evidence ladder

When something doesn't look like the walkthrough, go down this ladder in order:

| Rung | Command | Answers |
|---|---|---|
| 1 Snapshot | `kubectl get <obj> -o wide` | What exists, on which node, with which IP? |
| 2 Events | `kubectl get events --sort-by=.lastTimestamp` | What did the cluster try? |
| 3 Spec / conditions | `kubectl describe <obj>` | Where did it stop? |
| 4 Logs | `kubectl logs <pod>` | What did the app see? |
| 5 Endpoint | `curl` / `port-forward` | Does the passenger's request work? |

## When a command fails

- `NotFound` → wrong stage, namespace or context. Don't create objects to silence it.
- `connection refused` → wrong address, or the listener isn't ready yet.
- `Pending` or a timeout → read the events. Don't just `apply` again.
- Each walkthrough has a "When something looks wrong" table, and the [troubleshooting page](../troubleshooting) has more.

Next: [Terminal, Git and YAML](./terminal-git-and-yaml).
