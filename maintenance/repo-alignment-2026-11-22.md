# Apollo11 alignment — 2026-11-22

Code revision: `23e6513d5b414fd1811a4b8c7f944ab469b711b2` (Apollo11 `main`).
Previous pin: `f6211e679f8ed66a5a19033ac49a3bfc3a506eab` (2026-10-22 alignment).
Every pinned GitHub blob/tree link in active Markdown was advanced to the new
revision, and every linked path was checked to exist there.

| Code commits since the pin | Learner-visible alignment |
|---|---|
| `6bc371b` | Helm 4 / kubectl / Trivy CI pins and Helm 3 refusal (CI chapter, setup, Stage 5); non-root Stage 5–7 images, `.dockerignore`, frontend lockfile (Stage 5, capstone, Stage 8 baseline); Stage 5 `/metrics` now placeholder Prometheus text (Stage 6, instrumenting chapter) |
| `90b5120` | Identity graceful shutdown fixed at the pin: Stage 4 and termination chapter now describe the `uvicorn.Server` subclass instead of an open defect |
| `b935f5c` | Stage 5 `helm test` smoke hook, `release-lab.sh`, `compare-lab.sh` (Stage 5 Steps 3–5, promotion and rollback chapter); SIGNALS restore by re-running `signals-lab.sh apply` (Stage 6 Step 5); Argo CD convergence and finalizer findings (status) |
| `9a1dcea` | Stages 1–3: `DATABASE_URL` built from the Secret with `$(POSTGRES_PASSWORD)` (Stage 1, Stage 5 comparison, configuration chapter — the old "Stage 5 fixes the literal password" story is retired); `rollout undo` annotation warning; Stage 2 `--scheme`, browser boundary, NodePort → ClusterIP and Traefik cluster-scoped cleanup, both-namespace TLS fallback drill, `curl-client` token automount off; Stage 3 apply order (StatefulSets → seed → apps), bounded seed waits, composite `ON CONFLICT`, split Redis args, 70 checks |
| `23e6513` | Stage 4 taint drill, preemption vs. pressure-eviction wording, worker-name independence; Stage 6–7 `request_id`/`trace_id`/`span_id` in all services' request logs via `logContext` (Stage 6, logs, traces, instrumenting chapters); Stage 7 Argo `ignoreDifferences` for search replicas (Stage 7, HPA chapter), `CACHE_TTL_SECONDS`, Redis reconnect cooldown (cache-aside chapter), k6 `HOST_HEADER`, exercise order, new search tests |

Status page: rebuilt from the 2026-10-24 evidence (`g1b`–`g1f`, `g15`, `g17`,
`g21`, `g22`, `g27`, `g2a`). The November 21–22 commits recorded no new live
lifecycle, so the page says the latest live evidence predates them. Tracker
rows G18, G19, G31, G33 and G34 are still `open` in `GAPS_TRACKER.md` although
the code changes address them; the docs describe the code, not the tracker
state. This alignment is the docs side of tracker G25a–G25c.

Validation: `npm run typecheck` and `npm run build`. Static documentation
validation only; no cluster lifecycle was run for this revision. New commands
added here (Stage 4 taint drill via `kubectl run --overrides`, Stage 2
both-namespace TLS fallback) are source-checked, not live-run.
