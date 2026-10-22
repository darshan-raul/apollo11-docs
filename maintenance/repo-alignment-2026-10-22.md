# Apollo11 alignment — 2026-10-22

Code revision: `f6211e679f8ed66a5a19033ac49a3bfc3a506eab`.
Docs base: `aada9b0`, with pre-existing uncommitted storage and Stage 3 edits.
Those edits were preserved; their source revision links were advanced with the
rest of the active course pages.

| Last five code commits | Learner-visible alignment |
|---|---|
| `f6211e6` | Stage-specific 18-image CI/Trivy gate and exact artifact publication; upgraded runtime scope; Alertmanager/local receiver/Blackbox probes; trace/log links; Stage 7 hard spread, capacity and VPA instructions; CloudNativePG/Falco walkthroughs; evidence and remaining gaps |
| `f186b6a` | k9s included in mise setup and verification |
| `1ac5c66` | Launchpad API validation/status codes, atomic seat bounds and compensation attempt, admin UI limits, overnight seed behavior; Search error/cache semantics carried into Stage 7 |
| `e044932` | mise/prep.sh setup, Docker prerequisite, global tool installation, optional AWS tools and unpinned tool-version boundary |
| `b8fe2be` | Learner-work ignored workspace already documented; hands-on review artifacts are maintainer evidence, not a new taught mechanism |

The old `verification-runs/apollo11-docs-gap-fixes.patch` targets an earlier lab
page structure and revision. Reverse-apply checking fails against the current
docs; patch application history cannot be established from that check. Its
revision/setup instructions have been superseded by direct current-source
alignment. Do not apply it over these walkthroughs.

Validation: `npm run typecheck` and `npm run build` passed. All pinned GitHub
blob/tree paths in active Markdown were checked against the local code tree.
This is static documentation validation, not a fresh cluster lifecycle. Runtime
results cited by the site are the repository's recorded October 22 evidence;
hosted publication, later-stage Argo CD reruns and staging remain unverified.

Publication follow-up: integrated with remote main `254a191`, preserving its newer setup, Ignition and flight-deck chapters. Resolved overlapping edits and repeated typecheck and production build before publication. No package upgrades or cloud operations were performed.
