---
title: "Stage 2 — Guidance: Networking & Edge Access"
description: "Climb the networking ladder from ClusterIP and CoreDNS through NodePort, Traefik Ingress and MetalLB to Envoy Gateway, and understand what each tool fixes that the one before it could not."
sidebar_label: "Stage 2: Guidance (Networking)"
---

# Stage 2: Guidance

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/stage2`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from the repo root.
- Builds on: the `kind-apollo11` cluster from [Ignition](./ignition) and the workloads from [Stage 1](./stage-1). Stage 1 must be torn down first.
- **Namespaces change here:** `apollo-airlines-apps` (APIs, databases, Redis) and `apollo-airlines-ui` (frontend). Stage 1's `apollo-airlines` is not reused.
- Concepts behind this stage: [Pod networks and CNI](./learn/networking/pod-network-and-cni) · [DNS and namespaces](./learn/networking/dns-and-namespaces) · [Service control and data paths](./learn/networking/service-control-and-data-paths) · [NodePort and LoadBalancer](./learn/networking/nodeport-and-loadbalancer) · [Ingress and TLS](./learn/networking/ingress-and-tls) · [Gateway API](./learn/networking/gateway-api)
:::

## Where we left off

- **Stage 1** put all ten components on Kubernetes. Deployments kept Pods alive. Services gave each one a stable name.
- But getting *into* the airline was crude:
  - **Five doors, one per service.** NodePorts 30080–30084. The frontend image had `http://localhost:30083` and friends baked in.
  - **No hostnames.** A passenger had to know that booking lives on port 30082.
  - **No TLS.** Logins and JWTs crossed the wire in plain HTTP.
  - **Adding a sixth service meant recreating the cluster**, because kind only forwards the host ports listed in `kind-config.yaml` when the cluster is created.
- And everything shared **one namespace**. The frontend sat next to the database password.

Stage 2 fixes the edge one step at a time. Each step adds one tool, and each tool exists because the previous one hit a wall.

## What changes in this stage

| Concern | Stage 1 | Stage 2 | Why it's better |
|---|---|---|---|
| Namespaces | One: `apollo-airlines` | **`apollo-airlines-apps`** and **`apollo-airlines-ui`** | UI and backends get separate boundaries for names, config, secrets and (later) policy |
| Config and secrets | One ConfigMap and Secret for everything | **One copy per namespace**; the UI Secret holds only `JWT_SECRET` | ConfigMaps and Secrets can't be read across namespaces, so the UI no longer holds the DB password |
| Service type | NodePort on every public service | **ClusterIP** on every app and DB Service | Inside traffic needs no outside door; the edge is a separate decision |
| Calling across namespaces | Short names, all in one namespace | **`<svc>.<namespace>`** names via CoreDNS | Works from any namespace without changing the target |
| Reaching the app from your laptop | Five NodePorts | **One Gateway address** on ports 80 and 443 (after trying NodePort, Ingress and MetalLB on the way) | One front door; routing by hostname |
| Routing | By port number | **By `Host` header**: `booking.apollo.local` → `booking` | Passengers use names, not numbers |
| TLS | None | **Wildcard `*.apollo.local` certificate** terminated at the edge | Encrypted from browser to edge |
| Frontend API URLs (baked at build time) | `http://localhost:3008x` | **`http(s)://<svc>.apollo.local`** | The browser talks to hostnames, not ports |
| Database storage | `emptyDir` | Still `emptyDir` | Not this stage's job: [Stage 3](./stage-3) |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `k8s/config/00-namespaces.yaml` | `apollo-airlines-apps` and `apollo-airlines-ui` | Replaces Stage 1's `namespace.yaml` |
| `k8s/config/configmap.yaml`, `secrets.yaml` | One ConfigMap and Secret per namespace | Replaces Stage 1's single copies |
| `k8s/config/serviceaccounts.yaml` | The same 13 ServiceAccounts; `frontend` now lives in the UI namespace | Same as Stage 1, new namespaces |
| `k8s/infra/`, `k8s/jobs/`, `k8s/apps/` | Databases, seed Jobs, apps. Same as Stage 1 except namespaces and **ClusterIP** Services | Replaces Stage 1's NodePort Services |
| `k8s/substages/01-internal-dns/` | A `curl-client` Pod in the UI namespace | New |
| `k8s/substages/02-nodeport/` | NodePort versions of five Services | Brings Stage 1's NodePorts back, on purpose, for comparison |
| `k8s/substages/03-traefik-ingress-tls/` | Traefik RBAC + IngressClass, DaemonSet, Service, Ingresses, `generate-certs.sh` | New: first single front door |
| `k8s/substages/04-metallb/` | MetalLB install, IP pool, Traefik as `type: LoadBalancer` | New: a real IP instead of a high port |
| `k8s/substages/05-envoy-gateway/` | Envoy Gateway install, GatewayClass, EnvoyProxy, Gateway, ReferenceGrant, six HTTPRoutes | New: **the edge every later stage keeps** |
| `scripts/apply.sh` | Applies the base, then the chosen substage (`--substage 1-5`, default 5) | Replaces Stage 1's `apply.sh` |
| `scripts/verify.sh`, `verify-tls.sh`, `teardown.sh` | Detects the active substage and checks it; trusted-HTTPS workflow; clean removal | — |

There is no top-level `kustomization.yaml` in this stage. `apply.sh` is the list.

## Walkthrough

The five substages are a ladder. Each one is applied with the same script, and each replaces the edge of the one before:

| Substage | Adds | The wall it hits |
|---|---|---|
| 1 Internal DNS | ClusterIP + CoreDNS names | Nothing outside the cluster can reach a ClusterIP |
| 2 NodePort | A port on every node | One port per service; no hostnames; no TLS |
| 3 Traefik Ingress + TLS | One proxy that routes by hostname and terminates TLS | Still reached through high ports 30080 / 30443 |
| 4 MetalLB | A real IP for `type: LoadBalancer`, on ports 80 / 443 | Ingress is one object for two owners; little status |
| 5 Envoy Gateway | Gateway API: split ownership, per-route status | Carried forward to Stage 3 onwards |

### Step 1: Clear Stage 1 and build the images

```bash
kubectl config current-context                 # must be kind-apollo11
bash stages/stage1/scripts/teardown.sh         # Stage 1 used different namespaces and ports
bash stages/stage2/scripts/apply.sh --substage 1
```

- **What happens:** `apply.sh` builds and loads the six images, then applies in five phases: namespaces and config, databases, seed Jobs, apps, then the chosen substage. Later substages can reuse the images with `--skip-build`.
- **Why tear down Stage 1:** each stage is a snapshot, not a patch. Stage 1's NodePorts would still hold ports 30080–30084, and Stage 2 needs them.
- **Watch out:** the frontend bakes its API URLs in at build time. [`build-images.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/scripts/build-images.sh) uses `http://<svc>.apollo.local` for substages 1–4 and `https://<svc>.apollo.local` for substage 5. If you reuse images with `--skip-build`, you keep whichever scheme you built last.

### Step 2: See the namespace split

Open [`00-namespaces.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/config/00-namespaces.yaml), [`configmap.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/config/configmap.yaml) and [`secrets.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/config/secrets.yaml):

```yaml
# secrets.yaml (trimmed): the same Secret name, twice
kind: Secret
metadata: {name: apollo-airlines-secrets, namespace: apollo-airlines-apps}
stringData:
  POSTGRES_PASSWORD: "postgres"     # only the backends need this
  JWT_SECRET: "..."
---
kind: Secret
metadata: {name: apollo-airlines-secrets, namespace: apollo-airlines-ui}
stringData:
  JWT_SECRET: "..."                 # the UI copy has no DB password
```

```bash
kubectl get deploy -n apollo-airlines-apps     # identity, flight, booking, search, notification, 3 DBs, redis
kubectl get deploy -n apollo-airlines-ui       # frontend
kubectl get svc -n apollo-airlines-apps        # all ClusterIP now
```

- **What a namespace is:** a boundary for names. Two objects can share a name if they live in different namespaces. Quotas, RBAC and NetworkPolicies are also set per namespace.
- **Why split here:** the UI and the backends have different owners, different risks and (from Stage 8) different network rules. A namespace is the cheapest boundary to draw early.
- **Why two copies of config:** a Pod can only read ConfigMaps and Secrets from its own namespace. That restriction is the point: the UI namespace never holds `POSTGRES_PASSWORD`.
- **Compared with Stage 1:** the app Deployments are the same apart from `namespace:` (only Redis's probe delays were tuned). The Services lost their `nodePort` and became `type: ClusterIP`. Exposure is now a separate layer you add on top.

### Step 3: Substage 1, find services by name across namespaces

```bash
kubectl get pod curl-client -n apollo-airlines-ui
C="kubectl exec -n apollo-airlines-ui curl-client --"
$C cat /etc/resolv.conf
$C nslookup identity                                   # fails
$C nslookup identity.apollo-airlines-apps              # works
$C curl -s http://identity.apollo-airlines-apps.svc.cluster.local:8080/healthz
kubectl get endpointslices -n apollo-airlines-apps
```

[`curl-client.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/01-internal-dns/curl-client.yaml) is a plain Pod (`curlimages/curl`, `sleep 3600`) placed in the UI namespace on purpose, so it calls the backends from the *other* side of the boundary.

- **What you see:**
  - `resolv.conf` has `search apollo-airlines-ui.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5`.
  - The short name `identity` is expanded with the **caller's** namespace (`identity.apollo-airlines-ui.svc…`), which doesn't exist.
  - `identity.apollo-airlines-apps` and the full name both return the Service's ClusterIP. `/healthz` returns `{"status":"ok"}`.
- **What it means:** a Service's full DNS name is `<service>.<namespace>.svc.cluster.local`. CoreDNS answers it. Inside the same namespace the short name still works, which is why booking's `FLIGHT_SERVICE_URL=http://flight:8081` didn't change.
- **The ClusterIP is virtual:** no Pod has that address. kube-proxy on each node rewrites packets for it into one **ready** Pod IP from the EndpointSlice. See [Service control and data paths](./learn/networking/service-control-and-data-paths).
- **Readiness still decides who gets traffic:** search's `/readyz` calls flight's `/readyz`. If flight has no ready Pods, search's Pods stay `Running` but drop out of search's EndpointSlice (`ready=false`). Nothing restarts. This is the Stage 1 rule ("ready Pods only"), now across a call chain.
- **The wall:** a ClusterIP only exists inside the cluster. Your laptop can't route to `10.96.x.x`.

### Step 4: Substage 2, NodePort, the first door out

```bash
bash stages/stage2/scripts/apply.sh --substage 2 --skip-build
kubectl get svc -n apollo-airlines-apps flight \
  -o jsonpath='port={.spec.ports[0].port} targetPort={.spec.ports[0].targetPort} nodePort={.spec.ports[0].nodePort}{"\n"}'
curl -s localhost:30081/healthz
curl -s localhost:30083/healthz
```

[`nodeport-services.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/02-nodeport/nodeport-services.yaml) re-declares five Services with the same names:

```yaml
kind: Service
metadata: {name: flight, namespace: apollo-airlines-apps}
spec:
  type: NodePort
  selector: {app: flight}
  ports:
    - port: 8081         # the Service's own port (on the ClusterIP)
      targetPort: 8081   # the container port traffic is sent to
      nodePort: 30081    # opened on every node, range 30000-32767
```

- **What happens:** every node now listens on 30081 and forwards to a ready flight Pod, on any node.
- **Why it works on your laptop:** kind's [`kind-config.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/ignition/kind-config.yaml) maps host ports 30080–30084 and 30443 to the control-plane container. A NodePort outside that list is open on the nodes but not on `localhost`.
- **Three port numbers, three jobs:** `port` is what other Pods call. `targetPort` is what the container listens on. `nodePort` is what the outside calls. A wrong `targetPort` gives "connection refused" even though the Pod is healthy.
- **Compared with Stage 1:** this *is* Stage 1's edge, now isolated as one rung so you can see its limits.
- **The wall:**
  - One port per service. Exposing a sixth means editing `kind-config.yaml` and recreating the cluster.
  - Layer 4 only: kube-proxy forwards TCP, it never reads the HTTP request. So no routing by hostname or path, and no TLS.

### Step 5: Substage 3, Traefik Ingress, one door that reads the request

An **Ingress controller** is a reverse proxy running in the cluster. An **Ingress** is a rule it reads: "host `flight.apollo.local` goes to Service `flight` on 8081". The Ingress object does nothing on its own; the controller does the work.

```bash
bash stages/stage2/scripts/apply.sh --substage 3 --skip-build
kubectl get pods -n kube-system -l app=traefik -o wide       # runs on the control-plane node
kubectl get ingress -A
for h in identity flight booking search nonexistent; do
  printf '%-12s ' $h; curl -s -o /dev/null -w '%{http_code}\n' -H "Host: $h.apollo.local" localhost:30080/healthz
done
curl -kv --resolve identity.apollo.local:30443:127.0.0.1 https://identity.apollo.local:30443/healthz 2>&1 | grep -E 'subject:|issuer:'
```

From [`01-traefik-daemonset.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/03-traefik-ingress-tls/01-traefik-daemonset.yaml), [`01b-traefik-service.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/03-traefik-ingress-tls/01b-traefik-service.yaml) and [`03-ingress-apps.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/03-traefik-ingress-tls/03-ingress-apps.yaml):

```yaml
# Traefik DaemonSet (trimmed), in kube-system
nodeSelector: {node-role.kubernetes.io/control-plane: ""}   # where kind's port mappings land
args:
  - --providers.kubernetesingress          # read Ingress objects
  - --entrypoints.web.address=:8000
  - --entrypoints.websecure.address=:8443
  - --entrypoints.websecure.http.tls=true
---
# Traefik Service: still a NodePort, but only one pair for everything
ports:
  - {name: web,       port: 80,  targetPort: 8000, nodePort: 30080}
  - {name: websecure, port: 443, targetPort: 8443, nodePort: 30443}
---
# One Ingress per backend
kind: Ingress
metadata: {name: flight, namespace: apollo-airlines-apps}
spec:
  ingressClassName: traefik                 # "Traefik, this rule is yours"
  tls:
    - hosts: [flight.apollo.local]
      secretName: apollo-tls-secret         # must be in the Ingress's own namespace
  rules:
    - host: flight.apollo.local             # match on the Host header
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: flight, port: {number: 8081}}}}
```

- **What happens:** every request arrives at the same port. Traefik reads the `Host` header and picks the Service. `identity/flight/booking/search` return `200`. `nonexistent` returns `404`.
- **Reading a 404 vs a 503:** the 404 is Traefik's own reply: no rule matched, no backend was contacted. If a rule matches but its Service has no ready Pods, you get `503` instead. 404 means "routing", 5xx means "routing worked, backend didn't".
- **TLS:** [`generate-certs.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/03-traefik-ingress-tls/generate-certs.sh) makes one self-signed `*.apollo.local` certificate and stores it as `apollo-tls-secret` in **both** namespaces, because each Ingress can only reference a Secret in its own namespace. Traefik decrypts at the edge and talks plain HTTP to the Pods. This is **TLS termination**.
- **Default certificate fallback:** if `apollo-tls-secret` is missing, Traefik doesn't refuse the connection. It serves `TRAEFIK DEFAULT CERT` instead. The app stays healthy; only the certificate changed. `curl -k` hides this, so check the issuer.
- **Compared with substage 2:** five ports became one pair. Routing moved from Layer 4 (port numbers) to Layer 7 (hostnames). TLS appeared.
- **The wall:** the front door is still a NodePort on 30080 / 30443. Real clients expect ports 80 and 443 on a real address.

### Step 6: Substage 4, MetalLB, a real address for `type: LoadBalancer`

A Service of `type: LoadBalancer` asks the environment for an external IP. In a cloud, the cloud controller creates a load balancer. In kind there is no cloud, so the request stays `<pending>` forever. **MetalLB** is a controller that fulfils it on a local network.

```bash
bash stages/stage2/scripts/apply.sh --substage 4 --skip-build
kubectl get svc traefik -n kube-system                          # EXTERNAL-IP from the pool
kubectl get ipaddresspool -n metallb-system apollo-pool -o jsonpath='{.spec.addresses}{"\n"}'
LB_IP=$(kubectl get svc traefik -n kube-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}'); echo $LB_IP
curl -s -H "Host: identity.apollo.local" http://$LB_IP/healthz
curl -k -s --resolve identity.apollo.local:443:$LB_IP https://identity.apollo.local/healthz
```

From [`01-ip-pool.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/04-metallb/01-ip-pool.yaml) and [`traefik-loadbalancer-svc.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/04-metallb/traefik-loadbalancer-svc.yaml):

```yaml
kind: IPAddressPool
metadata: {name: apollo-pool, namespace: metallb-system}
spec:
  addresses: [172.18.0.50-172.18.0.100]   # a slice of kind's Docker network, clear of node IPs
---
kind: L2Advertisement                      # answer ARP for these IPs; no router setup needed
spec: {ipAddressPools: [apollo-pool]}
---
kind: Service
metadata: {name: traefik, namespace: kube-system}
spec:
  type: LoadBalancer                       # was NodePort in substage 3
  ports:
    - {name: web,       port: 80,  targetPort: 8000}
    - {name: websecure, port: 443, targetPort: 8443}
```

- **What happens:** MetalLB's controller picks an IP from `apollo-pool` and writes it to the Service's status. Its speaker Pods answer ARP for that IP, so packets for it reach a node, and kube-proxy forwards them to Traefik.
- **Why this way:** `type: LoadBalancer` is the portable request. The same Service YAML works on AWS or GCP; only the controller that fulfils it changes. MetalLB lets you learn that model on a laptop.
- **What `<pending>` means:** no controller, no free address in the pool, or an address requested outside it. The API accepts the Service either way; the controller's events say why.
- **Compared with substage 3:** same Traefik, same Ingresses. Only the Service type changed, and the high ports disappeared.
- **The wall:** the Ingress API itself.
  - One object mixes the platform's concerns (ports, certificates) with the app team's (hostname → Service).
  - Anything beyond host and path (redirects, header rules, timeouts) needs controller-specific annotations.
  - An Ingress has little status: when a rule is wrong, the object doesn't tell you which part.

:::caution[MetalLB on kind, Docker Desktop and non-default networks]
- The pool assumes kind's Docker network is `172.18.0.0/16`. Check yours with `docker network inspect kind -f '{{(index .IPAM.Config 0).Subnet}}'`. If it differs, edit the `IPAddressPool` in `01-ip-pool.yaml` and re-apply.
- On macOS and Windows (Docker Desktop), the kind network is not routable from your host, so `curl http://$LB_IP` cannot connect even when everything is correct. Run the same `curl` from a node: `docker exec apollo11-control-plane curl -s -H "Host: identity.apollo.local" http://$LB_IP/healthz`.
:::

### Step 7: Substage 5, Envoy Gateway, the edge that stays

The **Gateway API** is the successor to Ingress. It splits the edge into objects with different owners:

| Object | Owner | Says |
|---|---|---|
| `GatewayClass` | Cluster admin | "Gateways of class `eg` are run by Envoy Gateway" |
| `Gateway` | Platform team | "Listen on 80 and 443, use this certificate, accept routes from these namespaces" |
| `HTTPRoute` | App team | "`booking.apollo.local` goes to Service `booking:8082`" |
| `ReferenceGrant` | Owner of the target namespace | "Routes from that namespace may point at my Service" |

**Envoy Gateway** is the controller that reads them and runs Envoy proxies.

```bash
bash stages/stage2/scripts/apply.sh --substage 5      # no --skip-build: substage 5 needs the HTTPS frontend
kubectl get gatewayclass,gateway -A
kubectl get httproute -A
kubectl get svc -n envoy-gateway-system               # the proxy Service, type LoadBalancer, MetalLB IP
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}'); echo $GW
kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}{"\n"}'
for h in identity flight booking search; do
  printf '%-9s ' $h; curl -s -o /dev/null -w '%{http_code}\n' -H "Host: $h.apollo.local" http://$GW/healthz
done
curl -s -o /dev/null -w 'frontend %{http_code}\n' -H "Host: frontend.apollo.local" http://$GW/
```

From [`01-gateway.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/05-envoy-gateway/01-gateway.yaml), [`00b-envoyproxy.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/05-envoy-gateway/00b-envoyproxy.yaml), [`07-httproute-frontend.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/05-envoy-gateway/07-httproute-frontend.yaml) and [`01a-referencegrant.yaml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/k8s/substages/05-envoy-gateway/01a-referencegrant.yaml):

```yaml
kind: Gateway
metadata: {name: apollo-gateway, namespace: apollo-airlines-apps}
spec:
  gatewayClassName: eg
  infrastructure:
    parametersRef: {kind: EnvoyProxy, name: envoyproxy-lb-config}   # -> envoyService.type: LoadBalancer
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes: {namespaces: {from: All}}     # routes in any namespace may attach
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs: [{name: apollo-tls-secret}]   # one Secret, in the Gateway's namespace
      allowedRoutes: {namespaces: {from: All}}
---
kind: HTTPRoute
metadata: {name: frontend, namespace: apollo-airlines-ui}
spec:
  parentRefs:
    - name: apollo-gateway
      namespace: apollo-airlines-apps              # attaching across namespaces: must be explicit
  hostnames: ["frontend.apollo.local"]
  rules:
    - backendRefs: [{name: frontend, port: 3000}]
---
kind: ReferenceGrant
metadata: {name: apollo-gateway-grant, namespace: apollo-airlines-ui}
spec:
  from: [{group: gateway.networking.k8s.io, kind: HTTPRoute, namespace: apollo-airlines-apps}]
  to:   [{group: "", kind: Service, name: frontend}]   # lets routes in -apps point at this Service
```

- **What happens:**
  - `apply.sh` first deletes Traefik and the Ingresses. MetalLB stays.
  - It installs Envoy Gateway (server-side apply, because the Gateway API CRDs are too large for client-side apply).
  - The controller sees the Gateway, creates an Envoy Deployment and a `LoadBalancer` Service in `envoy-gateway-system`, and MetalLB gives it an IP.
  - Each HTTPRoute becomes Envoy config, pushed live without restarting the proxy.
- **Two separate permissions:**
  - *May this route attach to the Gateway?* Decided by the listener's `allowedRoutes`. Failure: `Accepted=False` (`NotAllowedByListeners`) on the route.
  - *May this route point at a Service in another namespace?* Decided by a `ReferenceGrant` in the Service's namespace. Failure: `ResolvedRefs=False` (`RefNotPermitted`).
  - The frontend route lives next to its Service, so it only needs the first. The grant lets a route in `apollo-airlines-apps` target `frontend` if one is ever added.
- **Status is per object:** GatewayClass `Accepted`; Gateway `Accepted` and `Programmed` (the data plane is live); each route reports `Accepted` and `ResolvedRefs` per parent. A route pointing at a wrong port shows `ResolvedRefs=False`, and requests get a 5xx (Envoy returns 500). Ingress had nothing like this.
- **One certificate:** the Gateway terminates TLS for every hostname with one Secret in its own namespace. With Ingress, each namespace needed its own copy.
- **Compared with substage 4:** same MetalLB address model, same hostnames. What changed is *who owns what*, and that every hop now reports its own status. This Gateway + MetalLB pair is the edge in [Stage 3](./stage-3) and every stage after it.

### Step 8: Use HTTPS properly, not just `curl -k`

`curl -k` proves a TLS port answers. It does not prove a browser would trust it. Check trust and hostname for real:

```bash
kubectl -n apollo-airlines-apps get secret apollo-tls-secret -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/apollo-ca.crt
kubectl get gateway apollo-gateway -n apollo-airlines-apps \
  -o jsonpath='{.status.listeners[?(@.name=="https")].conditions}' | jq -r '.[]|"\(.type)=\(.status)"'
curl --cacert /tmp/apollo-ca.crt --resolve booking.apollo.local:443:$GW https://booking.apollo.local/readyz
curl --cacert /tmp/apollo-ca.crt --resolve untrusted.apollo.invalid:443:$GW https://untrusted.apollo.invalid/healthz; echo "exit=$?"   # 60
bash stages/stage2/scripts/verify-tls.sh
```

- **What you see:** the HTTPS listener's conditions are all `True`. Booking answers with verification on. The foreign hostname fails with exit code 60: the certificate is only valid for `*.apollo.local`.
- **What [`verify-tls.sh`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/stage2/scripts/verify-tls.sh) does:** trusted HTTPS health on each API, the frontend, a passenger login, a populated search, a booking and its cancellation, and the hostname rejection. Its last line is `Trusted HTTPS login, populated search, booking, cancellation, and hostname rejection passed.`
- **Listeners are independent:** if `apollo-tls-secret` is deleted, the HTTPS listener goes `ResolvedRefs=False` (`InvalidCertificateRef`) and HTTPS fails, while plain HTTP on port 80 keeps returning 200. Check the *listener* before suspecting the app.
- **Using the browser:** the frontend calls `https://identity.apollo.local` and friends directly. Add the Gateway IP and the five hostnames (`frontend`, `identity`, `flight`, `booking`, `search` `.apollo.local`) to your local name resolution (for example `/etc/hosts`), trust the certificate locally, then open `https://frontend.apollo.local`. In the browser's Network panel, every API call should be HTTPS.

:::caution[Self-signed certificate gotchas]
- The certificate is self-signed. Nothing trusts it until you trust it. That is normal for a local cluster and not a production setup.
- `generate-certs.sh` keeps an existing Secret and only creates missing ones (`--rotate` renews on purpose). If a Secret was deleted and recreated, it is a **new** certificate: extract `/tmp/apollo-ca.crt` again and update local trust. A stale CA copy is a common cause of "it worked yesterday".
- Pass `--context kind-apollo11` (or set `KUBE_CONTEXT`) to `generate-certs.sh` when running it by hand. It refuses any other context.
:::

## When something looks wrong

Work along the request path: name → Service → endpoints → edge address → proxy → route → backend.

| You see | Likely cause | First command |
|---|---|---|
| `could not resolve host` / `NXDOMAIN` | Short name used from another namespace | `kubectl exec -n apollo-airlines-ui curl-client -- nslookup <svc>.apollo-airlines-apps` |
| Timeout or refused to a Service, Pods `Running` | No ready endpoints (selector, `targetPort`, or a failing dependency) | `kubectl get endpointslice -n apollo-airlines-apps -l kubernetes.io/service-name=<svc>` |
| Works in the cluster, not from the laptop | Port not in kind's mappings, or LB IP not routable from host | `kubectl get svc -A`, `docker ps` ports, then `curl` from `apollo11-control-plane` |
| `EXTERNAL-IP <pending>` | No MetalLB controller, no pool, or address outside the pool | `kubectl describe svc <svc>` → Events; `kubectl get ipaddresspool -n metallb-system` |
| `404` from the proxy | No route matches the `Host` header | `kubectl get ingress -A` / `kubectl get httproute -A` |
| `5xx` from the proxy | Route matched, backend wrong or has no ready Pods | `kubectl describe httproute <name> -n <ns>` → conditions |
| Route `Accepted=False` | Listener's `allowedRoutes` rejects its namespace | `kubectl get httproute <name> -n <ns> -o yaml` → `status.parents` |
| Route `ResolvedRefs=False` | Wrong Service name/port, or missing `ReferenceGrant` | Same as above; check `reason` |
| TLS error, or issuer `TRAEFIK DEFAULT CERT` | Certificate Secret missing, or stale CA on your side | Gateway listener conditions; `curl -v` issuer line |

More in the [troubleshooting page](./troubleshooting).

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| Delete `booking-db`'s Pod and every booking is gone | Databases are still Deployments with `emptyDir` | [Stage 3](./stage-3): StatefulSets and PVCs |
| Database Pods have random names | Nothing can address "the" identity database Pod by a stable name | [Stage 3](./stage-3): StatefulSets and headless Services |
| Any Pod can call any Pod, in any namespace | Namespaces separate names, not traffic | Stage 8 (planned): NetworkPolicies with Calico |
| Self-signed certificate, renewed by a script | No automatic issuance or renewal; manual trust | Not covered in the verified stages |
| Probes are basic; no resource requests | The kubelet and scheduler are guessing | [Stage 4](./stage-4): probes, requests/limits, PDBs |
| Dozens of YAML files applied by a script | Repeated values; no environments; no release history | [Stage 5](./stage-5): Helm, Kustomize, Argo CD |

## The journey so far

| Concern | Launchpad | Ignition | Stage 1 | **Stage 2** |
|---|---|---|---|---|
| Runs on | One Docker host | Three-node kind cluster | Same cluster | Same cluster |
| Unit of deployment | Compose service | Bare Pod | Deployment | Deployment |
| Recovery | `restart:` on one host | None | ReplicaSet replaces Pods | Same |
| Namespaces | — | `default` | `apollo-airlines` | **`apollo-airlines-apps` / `-ui`** |
| Service discovery | Docker DNS | Pod IP only | Service + cluster DNS | **Cross-namespace DNS names** |
| External access | `ports:` | `kubectl port-forward` | NodePort | **Envoy Gateway on a MetalLB IP** |
| Routing | By port | — | By port | **By hostname (HTTPRoute)** |
| TLS | None | None | None | **Wildcard cert at the Gateway** |
| Config / secrets | `environment:` | Inline in `pod.yaml` | ConfigMap / Secret | **One copy per namespace** |
| Data | Named volume | — | `emptyDir` (ephemeral) | `emptyDir` (ephemeral) |

## Clean up

```bash
bash stages/stage2/scripts/verify.sh       # optional: checks whichever substage is active
bash stages/stage2/scripts/teardown.sh     # removes Traefik, Gateway objects and the four namespaces
kubectl get ns apollo-airlines-apps apollo-airlines-ui envoy-gateway-system metallb-system   # all NotFound
```

The kind cluster stays. Stage 3 installs its own copy of the same MetalLB + Envoy Gateway edge.

## You should now be able to explain

- Why `identity` doesn't resolve from the UI namespace and `identity.apollo-airlines-apps` does.
- Why the UI namespace has its own Secret, and why it lacks `POSTGRES_PASSWORD`.
- What `port`, `targetPort` and `nodePort` each do, and why a NodePort isn't automatically on `localhost`.
- What an Ingress controller does that a NodePort can't, and what a 404 vs a 5xx from it tells you.
- What fulfils `type: LoadBalancer`, and what `<pending>` means.
- Why Gateway API splits the edge into GatewayClass, Gateway and HTTPRoute, and which object to fix for `Accepted=False` vs `ResolvedRefs=False`.
- What `curl -k` does not prove.

**Next:** [Stage 3: Mission Data](./stage-3) keeps this edge and gives the databases storage that outlives their Pods.
