# Apollo11 — The Learner’s Flight Plan

This repository is the Docusaurus learning site for the
[Apollo11 application repository](../Apollo11). Apollo11 is the source of
truth for runnable snapshots. This guide follows the same airline from
Launchpad through Liftoff, Guidance, Mission Data, and the missions beyond.
Each stage begins with an application problem and explains the Kubernetes
mechanisms that help solve it, with labs for taking the controls yourself.
The core path requires no cluster or container tools. Optional labs map to the
supported local path from Launchpad through Stage 7. Security and cloud
chapters teach concepts without claiming runnable Apollo implementations.

## Run the site locally

Prerequisites: Node.js 20 or newer and npm.

```bash
npm ci
npm start
```

Open the local URL printed by Docusaurus. To validate a production build:

```bash
npm run build
npm run serve
```

Documentation lives in `docs/`; navigation is defined in `sidebars.ts`.
Content provenance and the diagram backlog live under `maintenance/`.
Repository-specific excerpts must be checked against the sibling Apollo11
repository before they are changed.
