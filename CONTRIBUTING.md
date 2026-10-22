# Contributing to Apollo11 documentation

Use [GitHub issues](https://github.com/darshan-raul/apollo11-docs/issues) for
questions and corrections, and pull requests against `main` for documentation
changes. For a failed walkthrough, include the page URL, application commit
(`git rev-parse HEAD`), stage, OS/Docker environment, command, expected result
and actual output. Remove tokens, passwords and other private data from output.

## Check the matching application source

Runnable source lives in the separate
[Apollo11 repository](https://github.com/darshan-raul/Apollo11). For source-based
corrections, use a dedicated clone alongside this repository:

```bash
git clone https://github.com/darshan-raul/Apollo11.git ../Apollo11
git -C ../Apollo11 checkout f6211e679f8ed66a5a19033ac49a3bfc3a506eab
git -C ../Apollo11 rev-parse HEAD
```

If that directory already exists, inspect its revision and working tree first;
use a separate clone if it contains work you need to preserve. The source pin
is recorded in `docs/status.md` and `docs/labs/setup.md`. Check excerpts against
that revision and link to full files with GitHub `/blob/<commit>/` URLs.
Changing the course pin requires a separate source-alignment review across
affected pages. A static check does not establish a successful cluster run.

## Write and connect the page

- Follow [the writing guide](maintenance/style-guide.md), including chapter and
  walkthrough templates, expected results and verification labels.
- Put learner content in `docs/`, and maintainer evidence in `maintenance/`.
- Update `sidebars.ts` for a new page. Connect it from the relevant mission
  briefing and adjacent chapters; update `docusaurus.config.ts` or
  `src/pages/index.tsx` only when their navigation needs to change.
- Preserve existing page URLs and heading anchors where possible. If an anchor
  changes, update links to it. Identify runnable, conceptual and planned content
  explicitly; label commands without live evidence as unverified.

## Preview and validate

With Node.js 20+ and npm, from this repository root:

```bash
npm ci
npm start
```

Before submitting:

```bash
npm run typecheck
npm run build
git diff --check
```

The production build checks configured local links and Markdown images. Preview
the affected reader journey as well: entry point, prerequisites, commands,
expected result and cleanup. Builds do not execute application examples or
verify external URLs. State which examples were source-checked and which were
run, including the application revision and environment for live results.

In the pull request, explain the reader problem, the resulting behavior and
validation performed. Docusaurus (`package.json`, `docusaurus.config.ts` and
`sidebars.ts`) is authoritative. `mkdocs.yml`, `requirements.txt` and the older
root-level learning-plan documents are retained historical material.
