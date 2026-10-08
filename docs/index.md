---
title: "Apollo11 — The Learner's Flight Plan"
description: "Learn Kubernetes by taking one application, Apollo Airlines, from Docker Compose to a production-shaped platform, one better tool at a time."
sidebar_label: "Flight Plan & Overview"
---

# Apollo11: the learner's flight plan

- One application, **Apollo Airlines** (10 components), taken from Docker Compose to a production-shaped cluster.
- Each stage fixes a limit of the previous one: short chapters on the concepts, then a walkthrough of the stage that explains what each step does, why, and what it improved.
- Reading-only works. Hands-on is recommended.

## Start here

1. [Before you board](./start/prerequisites)
2. [How this course works](./start/how-to-use-this-course)
3. [Terminal, Git and YAML](./start/terminal-git-and-yaml)
4. [Meet Apollo Airlines](./start/apollo-airlines)
5. [Prepare your launchpad](./labs/setup) (hands-on only)

## Flight plan

| Mission | Question |
|---|---|
| [Launchpad · Containers](./missions/launchpad) | What survives a restart on one machine? |
| [Ignition · First cluster](./missions/ignition) | Which component does what to a Pod? |
| [1 · Liftoff](./missions/liftoff) | A Pod vanishes. Who replaces it? |
| [2 · Guidance](./missions/guidance) | How does a request find a Pod whose IP changes? |
| [3 · Mission Data](./missions/mission-data) | Which bytes survive Pod replacement? |
| [4 · Flight Control](./missions/flight-control) | How do Pods start, stop and move without dropping requests? |
| [5 · Payload Integration](./missions/payload-integration) | How do we ship and roll back a change? |
| [6 · Mission Operations](./missions/mission-operations) | Booking is slow. Which signal explains it? |
| [7 · Orbital Maneuvering](./missions/orbital-maneuvering) | Load grows. Which change helps? |
| [Command Module · Security](./missions/command-module) | *Planned.* Who can act, reach, read? |
| [Lunar Orbit · Cloud](./missions/lunar-orbit) | *Planned.* What changes on EKS? |
| [Capstone](./learn/capstone/a-booking-through-kubernetes) | Trace one booking through everything. |

- Runnable local path: Launchpad → Stage 7. Details: [Mission Status](./status).
- Optional: [Mission Extensions](./stage-10), [Towards Mars](./stage-11).

## Reference

- [Troubleshooting](./troubleshooting)
- [Command reference](./command-reference)
- [Glossary](./glossary)
