# Apollo11 documentation

This repository is the Docusaurus learning site for the
[Apollo11 application repository](../Apollo11). Apollo11 is the lab; this site
is the guided textbook. The supported hands-on path currently runs from
Launchpad through Stage 7. Pages for later stages are clearly marked as roadmap
material until the application repository contains verified implementations.

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
Repository-specific examples must be checked against the sibling Apollo11
repository before they are changed.
