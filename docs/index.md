---
title: "Apollo11 — The Learner's Flight Plan"
description: "Follow Apollo Airlines from its first container to orbit. Learn the story behind each Kubernetes mechanism, then take the controls in the labs."
sidebar_label: "Flight Plan & Overview"
---

# Apollo11: The Learner's Flight Plan

Welcome to **Apollo11**. You are going to get to know one application—Apollo
Airlines—and use the questions it raises to learn Kubernetes. We begin where a
developer normally begins: with containers that work on one machine. Each later
stage exists because that earlier arrangement has a specific limitation.

A passenger wants to book a flight. Behind that simple action are processes that
must find each other, a reservation that must survive a restart, and a response
that needs to arrive before the passenger gives up. As the airline grows, those
small requirements become the problems you will solve together.

You can follow the whole journey by reading. When you want to see a mechanism
at work, the labs let you build, inspect, break, and recover the same airline on
your machine. Start with the explanation, make a prediction, then take the
controls when you’re ready.

## 🛫 Meet Apollo Airlines

The frontend is the passenger’s window into the airline. Behind it, identity
looks after the passenger account, flight holds the flight and seat information,
booking coordinates the reservation, and notification handles confirmation work.
Databases keep the records those services need.

You will return to this application at every stage. When a Pod disappears, ask
what happens to the passenger’s booking. When an address changes, ask how another
service finds it. When traffic grows, ask where the extra work actually lands.

[Meet the airline and follow a passenger’s request →](./start/apollo-airlines)

## 🧭 Before you board

Bring basic terminal familiarity and an understanding that a browser sends an
HTTP request to a server. We will introduce containers, YAML, DNS, storage,
signals, and Kubernetes as the story needs them.

[Mission briefing](./start/prerequisites) sets out the starting point.
[Prepare your launchpad](./labs/setup) when you want to run the labs; installation
can wait until then.

## 🗺️ Your flight plan

The mission names stay with you throughout the journey. Inside each stage,
shorter chapters give you room to understand one relationship at a time.
The corresponding lab sits beside those chapters in the sidebar.

| Mission | The question that takes us there |
| --- | --- |
| [Launchpad · Containers](./learn/containers/process-image-container) | What does it mean to run Apollo Airlines on one machine? |
| [Ignition · First Cluster](./learn/cluster/why-orchestration) | Who keeps the application running when its pieces move or fail? |
| [Stage 1 · Liftoff](./learn/workloads/ownership-and-replicas) | A booking Pod disappears. Who replaces it? |
| [Stage 2 · Guidance](./learn/networking/pod-network-and-cni) | How does a request find the right service when Pod addresses change? |
| [Stage 3 · Mission Data](./learn/storage/volume-lifetimes) | Which bytes survive when the database Pod is replaced? |
| [Stage 4 · Flight Control](./learn/reliability/probes) | When should a service accept work, restart, or leave gracefully? |
| [Stage 5 · Payload Integration](./learn/delivery/rendering-and-helm) | How do we ship the next version and recover from a bad change? |
| [Stage 6 · Mission Operations](./learn/observability/signals-and-metrics) | A booking is slow. What can the system tell us about why? |
| [Stage 7 · Orbital Maneuvering](./learn/scaling/measurement-baseline) | More passengers arrive. Which change will actually help? |
| [Command Module · Security](./learn/security/identity-and-authorization) | Who may change the system, reach a service, or read a credential? |
| [Lunar Orbit · Cloud & Recovery](./learn/cloud/local-to-cloud) | What changes when the same application leaves the local cluster? |
| [Capstone · A Passenger’s Booking](./learn/capstone/a-booking-through-kubernetes) | Can we bring the whole journey together in one request? |

Launchpad through Stage 7 form the supported local lab path. Command Module and
Lunar Orbit teach the concepts behind future missions; their Apollo labs remain
planned. [Mission Status](./status) explains what exists today.
[Mission Extensions](./stage-10) and [Towards Mars](./stage-11) mark the optional
directions beyond the core journey.

## 🔬 Learn to follow the clues

A command is most useful when you know the question it answers. Before changing
anything in a lab, pause and predict what will happen. Afterward, compare the
result with your prediction. If they differ, you have something worth
investigating.

Apollo’s **5-Rung Evidence Ladder** gives those investigations a starting point:

1. **Snapshot:** Which resources exist, and what do they report?
2. **Events:** What has the cluster tried to do?
3. **Spec and conditions:** What was requested, and where has progress stopped?
4. **Logs:** What did the application experience?
5. **Passenger experience:** Can someone complete the request they came to make?

The chapters explain these observations before the labs ask you to collect them.
A running process, a ready Pod, and a successful booking tell you different
things. Learning to connect them is part of becoming comfortable at the controls.

Keep the [Troubleshooting Bible](./troubleshooting),
[Command Cheat Sheet](./command-reference), and [Glossary](./glossary) nearby
when you start investigating.

## 🚀 Ready for launch?

Begin with [Launchpad: Process, Image, and Container](./learn/containers/process-image-container).
We’ll start with a running program and build from there.
