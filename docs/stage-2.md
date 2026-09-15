---
title: "Stage 2: Guidance — Networking & Edge Access"
description: "Progressive networking ladder from internal ClusterIP and cross-namespace CoreDNS to Envoy Gateway API on MetalLB."
---

# Stage 2: Guidance — Networking & Edge Access

Stage 2 takes the single-namespace baseline from Stage 1 and establishes Kubernetes networking across two production namespaces:
- `apollo-airlines-apps`: Backend microservices (`identity`, `flight`, `booking`, `search`, `notification`), databases, and Redis.
- `apollo-airlines-ui`: Frontend single-page application (`frontend`).

Rather than duplicating static manifest files, Stage 2 follows a progressive **5-substage access ladder**. Workload Deployments and internal Service definitions remain stable; what evolves is **how traffic is discovered internally and routed from the outside edge**.

---

## The Networking Access Ladder

```
Substage 1                 Substage 2            Substage 3                Substage 4             Substage 5
──────────                 ──────────            ──────────                ──────────             ──────────
ClusterIP & DNS     ──►    NodePort       ──►    Traefik Ingress    ──►    MetalLB LoadBalancer ──► Envoy Gateway API
Internal FQDN              High NodePorts        Host routing              L2 ARP real IP         Gateway API CRDs
Endpoints & Slices         30080–30084           Local TLS termination     Port 80 / 443          Canonical Baseline
```

| Substage | Mechanism | Protocol / Port | Learning Outcome |
|---|---|---|---|
| **01-internal-dns** | `Service type: ClusterIP` | Virtual internal IPs | CoreDNS FQDN resolution, `Endpoints` vs `EndpointSlice`, selector binding |
| **02-nodeport** | `Service type: NodePort` | `localhost:30080–30084` | L4 host-to-container forwarding via `kube-proxy`, port target mapping |
| **03-traefik-ingress-tls** | Traefik v3 IngressController | `*.apollo.local:30443` | L7 Host routing, Ingress resources, wildcard TLS termination with Secrets |
| **04-metallb** | MetalLB L2 + `type: LoadBalancer` | `*.apollo.local` on MetalLB IP | ARP-based external IP allocation in local clusters, elimination of high NodePorts |
| **05-envoy-gateway** | Envoy Gateway v1.5.0 + MetalLB | `*.apollo.local` on MetalLB IP | Gateway API standard: GatewayClass, Gateway, HTTPRoute, cross-namespace ReferenceGrant |

:::important Canonical Access Baseline
**Envoy Gateway + MetalLB (Substage 5)** forms the **canonical access stack** that carries forward into Stage 3 and all subsequent stages. Traefik is a required transitional learning experience; Headless Services are introduced in Stage 3 alongside StatefulSets, and NetworkPolicies are deferred to Stage 8 where Calico enforcement makes them observable.
:::

---

## Directory Layout

```text
stages/stage2/
├── code/                        # Shared source code for Apollo Airlines services
├── k8s/
│   ├── config/                  # Namespaces (apps, ui), ConfigMaps, Secrets, ServiceAccounts
│   ├── infra/                   # identity-db, flight-db, booking-db, redis (Deployments + ClusterIP)
│   ├── jobs/                    # Idempotent database schema initialization Jobs
│   ├── apps/                    # identity, flight, booking, search, notification, frontend
│   └── substages/
│       ├── 01-internal-dns/     # Substage 1: curl client & cross-namespace DNS inspection
│       ├── 02-nodeport/         # Substage 2: NodePort service definitions (30080–30084)
│       ├── 03-traefik-ingress-tls/ # Substage 3: Traefik DaemonSet, TLS secret generator, Ingresses
│       ├── 04-metallb/          # Substage 4: MetalLB native manifest, IP pool, LoadBalancer Service
│       └── 05-envoy-gateway/    # Substage 5: Envoy Gateway v1.5.0, Gateway, HTTPRoutes, ReferenceGrant
└── scripts/
    ├── build-images.sh          # Builds all 6 application images and loads into kind
    ├── apply.sh                 # Progressive deployment orchestrator (--substage 1-5)
    ├── verify.sh                # Comprehensive verification suite (46-57 checks per active stack)
    └── teardown.sh              # Clean resource teardown and residue verification
```

---

## Hands-On Lab Walkthrough

### 1. Build and Load Images

Ensure your local `kind-apollo11` cluster is running, then build and load the container images:

```bash
./stages/stage2/scripts/build-images.sh --cluster apollo11
```

---

### 2. Walk Through the 5 Substages

Each substage follows the **Learner Contract**: **Build → Inspect → Break → Recover → Explain**.

#### Substage 1: Internal Discovery & Cross-Namespace DNS
Deploy baseline workloads and inspect CoreDNS discovery:
```bash
./stages/stage2/scripts/apply.sh --substage 1 --skip-build
```
- **Inspect:** Run `kubectl get endpoints -n apollo-airlines-apps` and query services from `curl-client` via `<svc>.<ns>.svc.cluster.local`.
- **Break:** Break the selector on `identity` service (`app: identity-broken`). Observe endpoints drop to `<none>`.
- **Recover:** Restore selector `app: identity`. Endpoints reappear and traffic flows.
- **Deep Dive:** See [DNS Resolution in Kubernetes](./stage-2/dns.md).

#### Substage 2: NodePort External Access
Expose services to the host machine via high NodePorts:
```bash
./stages/stage2/scripts/apply.sh --substage 2 --skip-build
```
- **Inspect:** Query `http://localhost:30083/healthz` (Identity) and `http://localhost:30080/` (Frontend).
- **Break:** Change `targetPort` on `identity` service to `9999`. Observe connection failure.
- **Recover:** Restore `targetPort: 8080`.
- **Deep Dive:** See [Service Types Deep Dive](./stage-2/services.md).

#### Substage 3: Traefik Ingress & Local TLS
Consolidate traffic behind an L7 reverse proxy with TLS termination:
```bash
./stages/stage2/scripts/apply.sh --substage 3 --skip-build
```
- **Inspect:** Query `https://identity.apollo.local:30443/healthz` and verify TLS certificate subject (`CN=*.apollo.local`).
- **Break:** Delete `apollo-tls-secret` in `apollo-airlines-apps`. Observe Traefik fallback to `TRAEFIK DEFAULT CERT`.
- **Recover:** Re-run `generate-certs.sh`. Certificate subject restored.
- **Deep Dive:** See [Ingress and Its Need](./stage-2/ingress.md).

#### Substage 4: MetalLB & LoadBalancer Services
Eliminate high NodePorts by provisioning real IP addresses on the local Docker network:
```bash
./stages/stage2/scripts/apply.sh --substage 4 --skip-build
```
- **Inspect:** Verify Traefik's `EXTERNAL-IP` (e.g. `172.18.0.50`). Query standard ports 80 and 443 directly on the IP.
- **Break:** Delete `apollo-pool` from `metallb-system`. Recreate Traefik service and observe `<pending>` EXTERNAL-IP.
- **Recover:** Reapply `01-ip-pool.yaml`. External IP is allocated immediately.

#### Substage 5: Migration to Envoy Gateway API (Canonical Baseline)
Decommission Traefik and transition to the modern Gateway API standard:
```bash
./stages/stage2/scripts/apply.sh --substage 5 --skip-build
```
- **Inspect:** Examine CRDs (`kubectl get crd | grep gateway`). Check Gateway status (`Accepted=True`, `Programmed=True`). Verify HTTPRoute attachments and access via the Envoy Proxy LoadBalancer IP.
- **Break:** Patch the `frontend` HTTPRoute's backend port to `9999`. Inspect route status `ResolvedRefs=False` and HTTP 500 error.
- **Recover:** Restore port `3000`. Route recovers to `Accepted=True`.
- **Deep Dive:** See [Gateway API — Next-Generation Routing](./stage-2/gateway-api.md).

---

## Verification

Run the verification test suite at any point:

```bash
./stages/stage2/scripts/verify.sh
```

The script automatically detects the active substage (1 through 5) and runs 46 to 57 checks verifying:
1. Core namespaces and token automount disabled on all 13 ServiceAccounts.
2. Workload readiness and database bootstrap Job completion.
3. Active EndpointSlices and CoreDNS resolution.
4. Layer-specific routing and TLS certificates.
5. End-to-end user authentication and database queries.

---

## Clean Up

Tear down Stage 2 resources:

```bash
./stages/stage2/scripts/teardown.sh
```

The teardown script removes application namespaces, the Gateway and HTTPRoutes, Envoy Gateway, and MetalLB, auditing the cluster for zero residue.

---

## What's Next

In [Stage 3: Mission Data](./stage-3.md), we build on this Envoy Gateway + MetalLB access baseline to replace ephemeral `emptyDir` database storage with **StatefulSets, PersistentVolumeClaims, and headless Services**.
