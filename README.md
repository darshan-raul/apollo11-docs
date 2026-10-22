# Apollo11 — The Learner’s Flight Plan

This repository is the Docusaurus learning site for the
[Apollo11 application repository](https://github.com/darshan-raul/Apollo11). Apollo11 is the source of
truth for runnable snapshots. This guide follows the same airline from
Launchpad through Liftoff, Guidance, Mission Data, and the missions beyond.
Each stage begins with an application problem and explains the Kubernetes
mechanisms that help solve it, then walks through the stage: what each step does, why, and what it improves over the last stage.
The core path requires no cluster or container tools. Walkthroughs map to the
supported local path from Launchpad through Stage 7. Security and cloud
chapters teach concepts without claiming runnable Apollo implementations.

[Read the course](https://apollo11.darshanraul.cloud/docs) or
[start with the prerequisites](https://apollo11.darshanraul.cloud/docs/start/prerequisites).
Reading the hosted course requires no local installation.

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

## Contribute or report a problem

See [CONTRIBUTING.md](./CONTRIBUTING.md) for source verification, navigation,
validation and pull requests. Report a problem through
[GitHub issues](https://github.com/darshan-raul/apollo11-docs/issues), including
the page, application revision, command and observed result when relevant.

Docusaurus and `package.json` define the active site. `mkdocs.yml` and
`requirements.txt` are historical migration artifacts; their old navigation
does not describe the current course. Python/MkDocs installation is unnecessary.
