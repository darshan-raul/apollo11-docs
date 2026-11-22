---
title: "Mission Status — Where Apollo Stands"
---

# Mission status

- **Documentation source revision:** `23e6513d5b414fd1811a4b8c7f944ab469b711b2` (2026-11-22 alignment).
- Prepare the [pinned workspace](./labs/setup#prepare-the-verified-workspace).
- Source of gap status: [`GAPS_TRACKER.md`](https://github.com/darshan-raul/Apollo11/blob/23e6513d5b414fd1811a4b8c7f944ab469b711b2/GAPS_TRACKER.md).
- This docs revision was checked statically and built; it does not constitute a new cluster run.
- **Evidence boundary:** the latest recorded live runs are from 2026-10-24, on code before the November 21–22 fixes (`9a1dcea`, `23e6513`). Those fixes — Secret-based `DATABASE_URL`s in Stages 1–4, script `--context`/`--help` handling, Stage 2 transition clean-up, Stage 3 apply ordering and Redis/seed fixes, Stage 4–7 code, verifier and Argo CD fixes — have not had a fresh lifecycle yet. Use each verifier's own summary, not the counts below, as the pass mark.

| Area | Recorded evidence and boundary | Do |
|---|---|---|
| Launchpad, Ignition, Stage 1 | Launchpad 74/74, Ignition 14/14, Stage 1 167/167, with break/recover labs and clean residue (2026-10-24) | Follow the walkthroughs |
| Stage 2 | Substages 1 and 2: 46/46 and 48/48 (2026-10-24); substages 3–5: 49, 46 and 61 checks (2026-10-19) | Follow [Stage 2](./stage-2) |
| Stage 3 | 69/69 (2026-10-19). The verifier now has 70 checks (Redis AOF survival added) | Follow [Stage 3](./stage-3) |
| Stage 4 | 149/149 with the identity graceful-shutdown fix (2026-10-24); the taint check was added afterwards | Follow [Stage 4](./stage-4) |
| Stage 5 dev | Helm 174/174; Kustomize 163/163 on the non-root images, clean purges (2026-10-24). The release lab (failed upgrade → rollback → `helm test`) passed 8/8 | Follow [Stage 5](./stage-5) |
| Stage 5 Argo CD | 74/74 against GitHub `main` and the published GHCR images, with real self-heal (2026-10-24) | Follow [Stage 5, Step 6](./stage-5#step-6-argo-cd-git-applies-the-change) |
| Stage 6 dev | Helm 212/212; Kustomize 201/201; trace/Loki correlation and observability lab (2026-10-24). Ordered signal path, substages 1–6 with each break and recovery: 34/35, the one failure a first-trace exporter warm-up race | Follow [Stage 6](./stage-6); rerun `trace-test.sh` once if the first trace misses a service |
| Stage 7 dev | Helm 227/227; Kustomize 216/216; trace, observability and scaling labs (2026-10-24) | Follow [Stage 7](./stage-7) |
| Stage 7 capacity | Normal 70% CPU policy scaled 1→2→3; zero failed requests, but dropped iterations failed the k6 threshold (2026-10-22) | Treat as a measured boundary, not a fully passing benchmark |
| Stage 6/7 Argo CD; Helm/staging | Argo CD did not converge on a 6-core / 16 GB host (84/88, 83/88); Stage 7 Argo teardown can strand the `argocd` namespace on pending finalizers (tracker G36, G37). Helm/staging with live VPA dates from 2026-08-25 | Do not extend dev pass counts to these paths; give Argo CD a larger host, and check `kubectl get ns argocd` after teardown |
| Hosted CI and GHCR | First green hosted run on 2026-10-24: validation, 18 Trivy-gated builds and 18 publishes. CI pins Helm v4.3.1, kubectl v1.37.1, Trivy v0.75.0. Images are public as `ghcr.io/darshan-raul/apollo11/stageN/<service>:sha-<commit>` and `:latest`. No `v1.0.0` release tag exists yet | Use the locally built images for the walkthroughs. Production values that pin `v1.0.0` will not pull until a release is tagged |
| Stage 8 | Planned clean security rebuild | Read [Stage 8](./stage-8); no inherited trust |
| Stage 9 / EKS | Planned capstone; EKS remains a prototype without a real-account lifecycle | Study [the boundary](./eks) |
| Stage 10 | CloudNativePG and Falco have live evidence and teardown; other missions planned | Follow [the optional catalog](./stage-10) |
| Stage 11 | Planned specializations | Read [Stage 11](./stage-11) |

The [October 24 evidence](https://github.com/darshan-raul/Apollo11/tree/23e6513d5b414fd1811a4b8c7f944ab469b711b2/verification-runs)
(`g1b`–`g1f`, `g15`, `g17`, `g21`, `g22`, `g27`, `g2a`) records successful
reruns alongside failed attempts and their fixes. The G1 lifecycle gap remains
in progress; old counts alone do not close it. Conceptual chapters stand alone,
and runnable commands require the matching snapshot.

## Tools by stage and lifecycle status

| Stage | Mission / Area | Primary Tools Introduced & Taught | Runnable Today? |
|---|---|---|---|
| **Launchpad** | Containers & Local Compose | Docker, Docker Compose, PostgreSQL | ✅ Runnable |
| **Ignition** | First Cluster | kind, kubectl | ✅ Runnable |
| **Stage 1** | Liftoff (Workloads & Configuration) | kubectl, k9s, Headlamp | ✅ Runnable |
| **Stage 2** | Guidance (Networking & Edge) | Envoy Gateway (Gateway API), MetalLB, Traefik (Ingress & TLS), CoreDNS | ✅ Runnable |
| **Stage 3** | Mission Data (Stateful & Storage) | PostgreSQL StatefulSets, Redis, local-path provisioner | ✅ Runnable |
| **Stage 4** | Flight Control (Reliability & Probes) | Liveness/Readiness/Startup Probes, Requests & Limits, PriorityClasses, PodDisruptionBudgets | ✅ Runnable |
| **Stage 5** | Payload Integration (Packaging & GitOps) | Helm, Kustomize, Argo CD, GitHub Actions | ✅ Runnable (dev/local) |
| **Stage 6** | Mission Operations (Observability) | Prometheus, OpenTelemetry SDK & Collector, Grafana, Grafana Tempo, Grafana Alloy, Grafana Loki, Alertmanager | ✅ Runnable (dev) |
| **Stage 7** | Orbital Maneuvering (Scaling & Caching) | Horizontal Pod Autoscaler (HPA), Vertical Pod Autoscaler (VPA), Redis (Cache-aside), k6 | ✅ Runnable (dev) |
| **Stage 8** | Command Module (Security Hardening) | HashiCorp Vault, External Secrets Operator (ESO), Reloader, Kyverno, Cosign / Sigstore, Trivy, Calico | ⏳ *Planned* |
| **Stage 9** | Lunar Orbit (Cloud Lifecycle & Capstone) | Terraform, Amazon EKS, ECR, EBS CSI driver, EKS Pod Identity, AWS Load Balancer Controller, cert-manager, Cluster Autoscaler, Velero | ⏳ *Planned* |
| **Stage 10** | Mission Extensions (Optional Operations Missions) | CloudNativePG, Falco, Linkerd, Argo Rollouts, ephemeral containers, Kubeshark, Chaos Mesh, advanced disaster recovery | 🔬 *Selective Labs* (CloudNativePG & Falco have live evidence; the rest are planned) |
| **Stage 11** | Towards Mars (Optional Specializations) | CRD and operator authoring, KEDA, k3s, Backstage, Kubecost, Cluster API | ⏳ *Planned* |

