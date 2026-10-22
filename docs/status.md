---
title: "Mission Status — Where Apollo Stands"
---

# Mission status

- **Documentation source revision:** `f6211e679f8ed66a5a19033ac49a3bfc3a506eab` (2026-10-22 alignment).
- Prepare the [pinned workspace](./labs/setup#prepare-the-verified-workspace).
- Source of gap status: [`GAPS_TRACKER.md`](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/GAPS_TRACKER.md).
- This docs revision was checked statically and built; it does not constitute a new cluster run.

| Area | Recorded evidence and boundary | Do |
|---|---|---|
| Launchpad → Stage 4 | Runnable snapshots; historical lifecycle evidence, including October Stage 2–4 runs | Follow the walkthrough and retain your own endpoint and recovery evidence |
| Stage 5 dev | Helm 174/174; Kustomize 163/163; clean purges | Follow [Stage 5](./stage-5) |
| Stage 6 dev | Helm 212/212; Kustomize 201/201; trace/Loki correlation and observability lab passed after Identity resource fix | Follow [Stage 6](./stage-6) |
| Stage 7 dev | Helm 227/227; Kustomize 216/216; trace/observability labs passed after spread fix | Follow [Stage 7](./stage-7) |
| Stage 7 capacity | Normal 70% CPU policy scaled 1→2→3; zero failed requests, but dropped iterations failed the k6 threshold | Treat as a measured boundary, not a fully passing benchmark |
| Stage 6/7 Argo CD; Helm/staging | Not rerun in the October 22 pass | Do not extend dev pass counts to these paths |
| Hosted CI and GHCR | Local validation and all 18 image scans passed; hosted run and publication remain unobserved | Registry examples describe the configured contract, not proof images exist |
| Stage 8 | Planned clean security rebuild | Read [Stage 8](./stage-8); no inherited trust |
| Stage 9 / EKS | Planned capstone; EKS remains a prototype without a real-account lifecycle | Study [the boundary](./eks) |
| Stage 10 | CloudNativePG and Falco have live evidence and teardown; other missions planned | Follow [the optional catalog](./stage-10) |
| Stage 11 | Planned specializations | Read [Stage 11](./stage-11) |

The [October 22 evidence](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/verification-runs/fix-2026-10-22/README.md)
records successful reruns alongside failed attempts and their fixes. The G1
lifecycle gap remains in progress; old counts alone do not close it. Conceptual
chapters stand alone, and runnable commands require the matching snapshot.
