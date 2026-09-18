---
title: "Launchpad — Make the Airline Run"
sidebar_label: "Mission briefing"
---

# Launchpad: Make the Airline Run

A passenger cannot book a flight until the airline’s programs are running
together. At first, that sounds simple: start the frontend, booking, identity,
flight, notification, the databases, and Redis. But the moment a request crosses
from one program to another, the useful questions begin. Which process is
actually running? Where did its files come from? Who is the client? What survives
when a container is replaced? When is a process truly ready to carry a booking?

This is Apollo’s ground school. We stay on one machine long enough to make those
boundaries feel real before Kubernetes adds a control plane and a cluster.

## What you will understand

By the end of Launchpad, you can explain the difference between an image, a
container, and the process inside it; why a browser and a backend see different
meanings of `localhost`; and why a running booking process may still be unable
to help a passenger.

Read the chapters in this order:

1. [Process, image, and container](../learn/containers/process-image-container)
2. [Images and runtime configuration](../learn/containers/images-and-configuration)
3. [Networks and clients](../learn/containers/networks-and-clients)
4. [State and dependencies](../learn/containers/state-and-dependencies)

Each chapter gives you one boundary to hold onto. The lab then lets you see all
four boundaries meet inside Apollo Airlines.

## When to take the controls

You are ready for the [Launchpad lab](../launchpad) when you can predict what
changes after restarting a container, explain why the browser cannot reach a
backend through its own `localhost`, and name a dependency that can make the
booking service unready. The lab is where you test those predictions, not where
you first encounter them.

Reading-only learners may continue after answering those readiness questions.
Hands-on learners should complete [optional lab setup](../labs/setup) to clone
the `Apollo11` repository at the pinned revision (`git clone https://github.com/darshan-raul/Apollo11.git && cd Apollo11`).
All lab exercises will run from your terminal inside that repository, beginning
in `cd stages/launchpad`.

