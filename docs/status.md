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
| Hosted CI and GHCR | Local validation and all 18 image scans passed. Every hosted CI run so far has failed at the validation step, so no image or release tag is published (tracker G2a, G15) | Registry examples describe the configured contract; those images do not exist yet. Use the locally built images |
| Stage 8 | Planned clean security rebuild | Read [Stage 8](./stage-8); no inherited trust |
| Stage 9 / EKS | Planned capstone; EKS remains a prototype without a real-account lifecycle | Study [the boundary](./eks) |
| Stage 10 | CloudNativePG and Falco have live evidence and teardown; other missions planned | Follow [the optional catalog](./stage-10) |
| Stage 11 | Planned specializations | Read [Stage 11](./stage-11) |

The [October 22 evidence](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/verification-runs/fix-2026-10-22/README.md)
records successful reruns alongside failed attempts and their fixes. The G1
lifecycle gap remains in progress; old counts alone do not close it. Conceptual
chapters stand alone, and runnable commands require the matching snapshot.

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

