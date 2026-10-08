---
title: "Launchpad — Make the Airline Run"
sidebar_label: "Mission briefing"
---

# Launchpad: containers on one machine

**Problem:** run all ten Apollo components together on one host, and know what survives a restart.

## Chapters

1. [Process, image, container](../learn/containers/process-image-container): what actually runs vs what is stored.
2. [Images and runtime configuration](../learn/containers/images-and-configuration): what is baked in vs injected at start.
3. [Networks and clients](../learn/containers/networks-and-clients): why `localhost` differs for browser and backend.
4. [State and dependencies](../learn/containers/state-and-dependencies): volumes, health, and startup order.
5. [Least privilege for containers](../learn/containers/least-privilege): non-root, read-only, no capabilities.

## Ready for the walkthrough when you can answer

- Rebuilding an image: does a running container change?
- Which data survives `docker compose down`? Which does not?
- Why does the frontend call `localhost:8080` but booking calls `identity:8080`?
- Name one dependency that makes booking unready while its process is alive.

## Walkthrough

- Setup: [Prepare your launchpad](../labs/setup)
- Walkthrough: [Launchpad](../launchpad), run from `Apollo11/stages/launchpad`
