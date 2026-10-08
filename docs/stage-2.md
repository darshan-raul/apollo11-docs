---
title: "Stage 2 — Guidance: Networking & Edge Access"
description: "Climb the networking ladder from ClusterIP and CoreDNS to Envoy Gateway on MetalLB, breaking and diagnosing each rung."
sidebar_label: "Stage 2: Guidance (Networking)"
---

# Build Stage 2: Guidance

:::info[Page type · lab]
- Repo: `Apollo11` at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run from the repo root.
- Needs: `kind-apollo11` cluster from [Ignition](./ignition).
- **Namespaces change here:** `apollo-airlines-apps` (APIs, databases, Redis) and `apollo-airlines-ui` (frontend). Stage 1's `apollo-airlines` is not reused.
- Read the [Guidance chapters](./learn/networking/pod-network-and-cni) first.
:::

**Skill this lab builds:** given "I can't reach X", decide which hop is broken: DNS name → Service → endpoints → node/edge address → proxy → route → backend.

## The ladder

Each substage is applied cumulatively: `./stages/stage2/scripts/apply.sh --substage N --skip-build`.

| # | Adds | Fixes the previous limit | Reach it with |
|---|---|---|---|
| 1 | ClusterIP + CoreDNS + `curl-client` Pod | Pod IPs change | `<svc>.<ns>.svc.cluster.local` from inside |
| 2 | NodePort 30080–30084 | Laptop can't reach ClusterIP | `localhost:3008x` (kind port map) |
| 3 | Traefik Ingress + wildcard TLS | Port per service | `Host:` header on `:30080`/`:30443` |
| 4 | MetalLB `type: LoadBalancer` | No cloud load balancer | Real IP from `172.18.0.50-100` |
| 5 | **Envoy Gateway + HTTPRoutes** (canonical, carried forward) | Single-owner Ingress | `*.apollo.local` on the Gateway IP |

## Request path to keep in your head

```mermaid
flowchart LR
  C[Client] --> D[DNS / Host header]
  D --> A[Edge address: NodePort · LB IP]
  A --> P[Proxy: Traefik · Envoy]
  P --> S[Service ClusterIP]
  S --> E[EndpointSlice: ready Pods only]
  E --> Pod
```

| Symptom | Likely hop | First command |
|---|---|---|
| `could not resolve host` | DNS / namespace | `nslookup <fqdn>` from a Pod |
| Timeout / refused to a Service | Endpoints | `get endpointslices -l kubernetes.io/service-name=<svc>` |
| Works in-cluster, not from laptop | Edge address / port map | `get svc -A`, `docker ps` ports |
| 404 from the proxy | Route / Host header | `get ingress` / `get httproute` |
| 5xx from the proxy | Backend / route status | `describe httproute` conditions |
| TLS error | Cert Secret / hostname | `curl -v`, Gateway listener conditions |

---

## Exercise 1: Resolve a Service by name across namespaces

**Concepts:** [DNS and namespaces](./learn/networking/dns-and-namespaces)

**Goal:** show why `identity` fails from the UI namespace and `identity.apollo-airlines-apps` works.
**Time:** ~10 min

1. **Predict:** from a Pod in `apollo-airlines-ui`, which of these resolve: `identity`, `identity.apollo-airlines-apps`, `identity.apollo-airlines-apps.svc.cluster.local`?
2. **Do:**

```bash
./stages/stage2/scripts/apply.sh --substage 1 --skip-build
kubectl get svc,endpointslices -n apollo-airlines-apps
C="kubectl exec -n apollo-airlines-ui curl-client --"
$C cat /etc/resolv.conf
$C nslookup identity
$C nslookup identity.apollo-airlines-apps
$C curl -s http://identity.apollo-airlines-apps.svc.cluster.local:8080/healthz
```

3. **Check:**
   - `resolv.conf` has `search apollo-airlines-ui.svc.cluster.local svc.cluster.local cluster.local`, `options ndots:5`.
   - `nslookup identity` → `NXDOMAIN`/can't find. The short name is expanded using the **caller's** namespace.
   - The other two return the Service ClusterIP (`10.96.x.x`). `/healthz` → `{"status":"ok"}`.
4. **Why:**
   - Namespaces change DNS: the FQDN is `<service>.<namespace>.svc.cluster.local`.
   - The ClusterIP is virtual: no Pod has that address. `kube-proxy` rewrites packets to it into a ready Pod IP.
5. **Your turn:** make the UI Pod reach `flight` using only a name that fits in a ConfigMap value. Which is the shortest name that works, and why does `flight.apollo-airlines-apps` work but not `flight.svc`?

<details>
<summary>Answer</summary>

`flight.apollo-airlines-apps`: the search list appends `svc.cluster.local`, giving the FQDN. `flight.svc` would be expanded to `flight.svc.apollo-airlines-ui.svc.cluster.local` and fails, because `svc` is not a namespace.
</details>

---

## Exercise 2: Break it: readiness removes Pods from the endpoint list

**Concepts:** [Service control and data paths](./learn/networking/service-control-and-data-paths) · [Services and readiness](./learn/workloads/services-and-readiness)

**Goal:** see a dependency outage turn into "no ready endpoints" while every Pod stays `Running`.
**Time:** ~10 min · **Needs:** Exercise 1. (Stage 1 already covered a selector typo; this is the other way endpoints go empty.)

1. **Predict:** `search` calls `flight` in its readiness check. If you scale `flight` to 0, what happens to `search`'s Pods and endpoints?
2. **Baseline:**

```bash
EPS() { kubectl get endpointslice -n apollo-airlines-apps -l kubernetes.io/service-name=$1 \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]} ready={.conditions.ready}{"\n"}{end}'; }
EPS search
```

3. **Inject:**

```bash
kubectl scale deploy/flight -n apollo-airlines-apps --replicas=0
sleep 20
kubectl get pods -n apollo-airlines-apps -l app=search
EPS search
EPS flight
$C curl -s -m 3 -o /dev/null -w 'search via Service -> %{http_code}\n' http://search.apollo-airlines-apps:8083/healthz
```

4. **Symptom:**
   - `search` Pods are `Running` but `0/1`. Restart count `0`.
   - `EPS search` shows `ready=false` for each; `EPS flight` is empty.
   - The request through the Service fails (timeout or refused): there is nowhere ready to send it.
5. **Diagnose** (name the owner before you look):

```bash
kubectl describe pod -n apollo-airlines-apps -l app=search | grep -E 'Readiness|Ready:|Restart Count'
kubectl exec -n apollo-airlines-apps deploy/search -- wget -qO- http://127.0.0.1:8083/readyz
```

   - Readiness probe `503`: `search` is alive but reports its dependency as down. The fault is `flight`, two hops away.
6. **Fix and prove:**

```bash
kubectl scale deploy/flight -n apollo-airlines-apps --replicas=2
kubectl rollout status deploy/flight -n apollo-airlines-apps
sleep 10; EPS search
$C curl -s http://search.apollo-airlines-apps:8083/readyz
```

   - `ready=true` again; `{"status":"ok"}`.
7. **Why:**
   - EndpointSlices carry a per-endpoint `ready` condition driven by the readiness probe. Services send traffic only to `ready=true`.
   - The kubelet does not restart anything here: unready is not unhealthy. Stage 4 builds on this.
8. **Your turn:** repeat with `kubectl scale deploy/identity --replicas=0`. Which Services' endpoints turn unready? Explain from what each service's `/readyz` checks (use Launchpad Exercise 5 as a guide).

<details>
<summary>Answer</summary>

`booking` first checks identity, so its `/readyz` fails and its endpoints go unready; `flight` and `search` do not depend on identity and stay ready. Restore with `--replicas=2`.
</details>

---

## Exercise 3: NodePort, and the part kind adds for you

**Concepts:** [NodePort and LoadBalancer](./learn/networking/nodeport-and-loadbalancer)

**Goal:** separate `port`, `targetPort` and `nodePort`, and prove why a NodePort is not automatically reachable from your laptop.
**Time:** ~10 min

1. **Predict:** `flight` listens on 8081 and has `nodePort: 30081`. You create a second Service on `nodePort: 30099`. Can your laptop reach it? Can the control-plane node?
2. **Do:**

```bash
./stages/stage2/scripts/apply.sh --substage 2 --skip-build
kubectl get svc -n apollo-airlines-apps flight -o jsonpath='port={.spec.ports[0].port} targetPort={.spec.ports[0].targetPort} nodePort={.spec.ports[0].nodePort}{"\n"}'
curl -s localhost:30081/readyz

kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Service
metadata: {name: flight-alt, namespace: apollo-airlines-apps}
spec:
  type: NodePort
  selector: {app: flight}
  ports: [{port: 9000, targetPort: 8081, nodePort: 30099}]
YAML
curl -s -m 3 localhost:30099/healthz || echo "laptop: unreachable"
docker exec apollo11-control-plane curl -s localhost:30099/healthz
docker exec apollo11-worker2 curl -s localhost:30099/healthz
```

3. **Check:**
   - `flight`: `port=8081 targetPort=8081 nodePort=30081`; the laptop gets `{"status":...}`.
   - `flight-alt`: the laptop **fails** (nothing maps host `30099`), but from **inside** the control-plane **and** worker nodes it answers.
4. **Why:**
   - The NodePort opens on **every** node. `localhost:30081` works only because `kind-config.yaml` forwards host ports `30080`–`30084` to the control-plane container.
   - `port` = Service port, `targetPort` = container port, `nodePort` = port on each node. Three different numbers: `9000 → 8081 ← 30099`.
5. **Clean up:** `kubectl delete svc flight-alt -n apollo-airlines-apps`.
6. **Your turn:** the frontend is on NodePort `30080`. Change nothing; use `kubectl get svc -A` and the kind config to explain what you would have to change to expose a 6th service on the laptop.

<details>
<summary>Answer</summary>

Add the node port to `extraPortMappings` in `kind-config.yaml` and **recreate the cluster**: kind cannot add port mappings to a running cluster. This is the cost of NodePort, and why Substage 3–5 move to hostnames.
</details>

---

## Exercise 4: Route by hostname and read a 404

**Concepts:** [Ingress and TLS](./learn/networking/ingress-and-tls)

**Goal:** prove Ingress routes on the `Host` header, and tell a routing miss from a backend failure.
**Time:** ~10 min

1. **Predict:** one address, one port. If you change only the `Host` header, which responses change?
2. **Do:**

```bash
./stages/stage2/scripts/apply.sh --substage 3 --skip-build
kubectl get ingress -A
for h in identity flight booking search nonexistent; do
  printf '%-12s ' $h; curl -s -o /dev/null -w '%{http_code}\n' -H "Host: $h.apollo.local" localhost:30080/healthz
done
```

3. **Check:** `identity/flight/booking/search` → `200`; `nonexistent` → `404`.
   - 404 is **Traefik's own** reply: no Ingress rule matched. The backend was never contacted.
4. **Compare the two failure shapes:**

```bash
kubectl scale deploy/booking -n apollo-airlines-apps --replicas=0
sleep 5
curl -s -o /dev/null -w 'booking (no backends) -> %{http_code}\n' -H "Host: booking.apollo.local" localhost:30080/healthz
curl -s -o /dev/null -w 'unknown host -> %{http_code}\n' -H "Host: nonexistent.apollo.local" localhost:30080/healthz
kubectl scale deploy/booking -n apollo-airlines-apps --replicas=2
kubectl rollout status deploy/booking -n apollo-airlines-apps
```

   - No backends → `503` (route matched, nothing to send to). Unknown host → `404` (no route).
5. **Why:**
   - An Ingress is only rules; Traefik reads them and runs the proxy.
   - `404` = routing layer. `502/503` = routing worked, backend didn't. This one rule saves most edge debugging.
6. **Your turn:** with the Ingress for `flight` intact, request `-H "Host: flight.apollo.local"` on path `/api/flights`. Then use `kubectl describe ingress flight -n apollo-airlines-apps` to find which `pathType` makes `/api/flights` match, and say what would change if it were `Exact`.

<details>
<summary>Answer</summary>

`pathType: Prefix` with path `/` matches everything under it. With `Exact`, only the literal path `/` would match, and `/api/flights` would return 404.
</details>

---

## Exercise 5: Break it: TLS Secret deleted behind Traefik

**Concepts:** [Ingress and TLS](./learn/networking/ingress-and-tls)

**Goal:** tell a certificate fault from an application fault.
**Time:** ~8 min · **Needs:** Exercise 4 (Substage 3 state).

1. **Predict:** you delete `apollo-tls-secret`. Does `identity` get unhealthy? What does a client see?
2. **Baseline:**

```bash
curl -kv --resolve identity.apollo.local:30443:127.0.0.1 https://identity.apollo.local:30443/healthz 2>&1 | grep -E 'issuer:|HTTP/|status'
```

   - Issuer contains `*.apollo.local`; response `{"status":"ok"}`.
3. **Inject:**

```bash
kubectl delete secret apollo-tls-secret -n apollo-airlines-apps
sleep 5
curl -kv --resolve identity.apollo.local:30443:127.0.0.1 https://identity.apollo.local:30443/healthz 2>&1 | grep -E 'issuer:|HTTP/|status'
kubectl get pods -n apollo-airlines-apps -l app=identity
```

4. **Symptom:** issuer is `CN=TRAEFIK DEFAULT CERT`. Pods are still `1/1`. Requests still succeed with `-k`.
5. **Diagnose:** the identity Pod and Service are fine, only the certificate presented changed ⇒ look at the Secret, not the logs.
6. **Fix and prove:**

```bash
bash stages/stage2/k8s/substages/03-traefik-ingress-tls/generate-certs.sh
curl -kv --resolve identity.apollo.local:30443:127.0.0.1 https://identity.apollo.local:30443/healthz 2>&1 | grep -E 'issuer:'
```

   - Issuer is the `*.apollo.local` wildcard again.
7. **Why:** TLS material is a separate dependency from routing and from the app. The proxy degrades to a default cert instead of failing. `-k` hid it.
8. **Your turn:** run the same check **without** `-k`, using the CA from the Secret, and say which hostnames are valid. (Exercise 8 does this fully against the Gateway.)

---

## Exercise 6: LoadBalancer addresses come from a controller

**Concepts:** [NodePort and LoadBalancer](./learn/networking/nodeport-and-loadbalancer)

**Goal:** see `type: LoadBalancer` fulfilled by MetalLB, and see what an unfulfillable request looks like.
**Time:** ~10 min

1. **Predict:** MetalLB's pool is `172.18.0.50-172.18.0.100`. You request `10.99.99.99`. What happens?
2. **Do:**

```bash
./stages/stage2/scripts/apply.sh --substage 4 --skip-build
kubectl get svc -n traefik
kubectl get ipaddresspool -n metallb-system apollo-pool -o jsonpath='{.spec.addresses}{"\n"}'
IP=$(kubectl get svc traefik -n traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'); echo $IP
curl -s -H "Host: identity.apollo.local" http://$IP/healthz
```

3. **Check:** `EXTERNAL-IP` is inside the pool. The request on port 80 works with no high port.
4. **Break: ask for an impossible address**

```bash
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Service
metadata:
  name: lb-test
  namespace: apollo-airlines-apps
  annotations: {metallb.universe.tf/loadBalancerIPs: 10.99.99.99}
spec:
  type: LoadBalancer
  selector: {app: flight}
  ports: [{port: 80, targetPort: 8081}]
YAML
sleep 5
kubectl get svc lb-test -n apollo-airlines-apps
kubectl describe svc lb-test -n apollo-airlines-apps | sed -n '/^Events:/,$p'
```

   - `EXTERNAL-IP <pending>`; an event from `metallb-controller` explains the allocation failure. The Service itself is accepted; nothing in the API rejected it.
5. **Fix and prove:**

```bash
kubectl annotate svc lb-test -n apollo-airlines-apps metallb.universe.tf/loadBalancerIPs=172.18.0.77 --overwrite
sleep 5; kubectl get svc lb-test -n apollo-airlines-apps
curl -s http://172.18.0.77/healthz
kubectl delete svc lb-test -n apollo-airlines-apps
```

6. **Why:**
   - `type: LoadBalancer` is a request. Something in your environment has to fulfil it. In AWS it is the cloud controller; here it is MetalLB.
   - `<pending>` forever = no controller, no free address, or an address outside the pool.
   - If `curl 172.18.0.77` cannot connect on macOS/Windows Docker Desktop, the Docker network is not routable from your host; use `docker exec apollo11-control-plane curl ...` instead.
7. **Your turn:** your Docker network is not `172.18.0.0/16`. Which command shows the right range, and which object do you edit?

<details>
<summary>Answer</summary>

`docker network inspect kind -f '{{(index .IPAM.Config 0).Subnet}}'`, then edit the `IPAddressPool` in `04-metallb/01-ip-pool.yaml` and re-apply.
</details>

---

## Exercise 7: Gateway API: chain, status and who may attach

**Concepts:** [Gateway API](./learn/networking/gateway-api)

**Goal:** read each Gateway API object's status, then break the two permissions that people confuse.
**Time:** ~20 min

1. **Predict:** which object owns (a) the listener, (b) the hostname-to-Service rule, (c) permission for a route in another namespace to attach?
2. **Do:**

```bash
./stages/stage2/scripts/apply.sh --substage 5 --skip-build
kubectl get gatewayclass,gateway -A
kubectl get httproute -A
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}'); echo $GW
kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}{"\n"}'
for h in identity flight booking search; do
  printf '%-9s ' $h; curl -s -o /dev/null -w '%{http_code}\n' -H "Host: $h.apollo.local" http://$GW/healthz
done
printf '%-9s ' frontend; curl -s -o /dev/null -w '%{http_code}\n' -H "Host: frontend.apollo.local" http://$GW/
```

3. **Check:**
   - GatewayClass `eg` `Accepted`. Gateway `Accepted=True Programmed=True`, with a MetalLB address.
   - Every host answers `200`. The proxy chose each backend from the `Host` header.
4. **Break A: backend reference that does not resolve**

```bash
kubectl patch httproute booking -n apollo-airlines-apps --type json \
  -p '[{"op":"replace","path":"/spec/rules/0/backendRefs/0/port","value":9999}]'
sleep 3
kubectl get httproute booking -n apollo-airlines-apps -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status}({.reason}) {end}{"\n"}'
curl -s -o /dev/null -w 'booking -> %{http_code}\n' -H "Host: booking.apollo.local" http://$GW/readyz
```

   - Symptom: `ResolvedRefs=False`, request returns a 5xx. `Accepted` is still `True`: the route attached fine, but its backend is wrong.
   - Fix: `kubectl patch httproute booking -n apollo-airlines-apps --type json -p '[{"op":"replace","path":"/spec/rules/0/backendRefs/0/port","value":8082}]'`. Prove: `booking -> 200`.
5. **Break B: remove permission to attach from another namespace**

```bash
kubectl patch gateway apollo-gateway -n apollo-airlines-apps --type json -p '[
 {"op":"replace","path":"/spec/listeners/0/allowedRoutes/namespaces/from","value":"Same"},
 {"op":"replace","path":"/spec/listeners/1/allowedRoutes/namespaces/from","value":"Same"}]'
sleep 3
kubectl get httproute frontend -n apollo-airlines-ui -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status}({.reason}) {end}{"\n"}'
curl -s -o /dev/null -w 'frontend -> %{http_code}\n' -H "Host: frontend.apollo.local" http://$GW/
curl -s -o /dev/null -w 'booking  -> %{http_code}\n' -H "Host: booking.apollo.local" http://$GW/readyz
```

   - Symptom: `Accepted=False(NotAllowedByListeners)`; frontend → `404`; booking (same namespace as the Gateway) still `200`.
   - Fix: patch both `from` values back to `All`. Prove: frontend answers again.
6. **Why:**

| Question | Object / field | Failure status |
|---|---|---|
| May this route attach to the listener? | `Gateway.listeners[].allowedRoutes` | `Accepted=False` (`NotAllowedByListeners`) |
| Can this route reach that Service? | Service exists in same ns, or a `ReferenceGrant` in the Service's ns | `ResolvedRefs=False` (`RefNotPermitted` / `BackendNotFound`) |
| Is the data plane live? | `Gateway` `Programmed` | `Programmed=False` |

   - Route-level conditions point at the exact misconfigured hop. Ingress had no such per-route status.
7. **Your turn:** put a route for `frontend.apollo.local` that targets a Service in **another** namespace: create `HTTPRoute test` in `apollo-airlines-apps` with a `backendRef` to `frontend` in `apollo-airlines-ui`. Predict the condition, then make it work using `stages/stage2/k8s/substages/05-envoy-gateway/01a-referencegrant.yaml` as the model.

<details>
<summary>Answer</summary>

Without a grant: `ResolvedRefs=False (RefNotPermitted)`. Adding a `ReferenceGrant` in `apollo-airlines-ui` that allows `HTTPRoute` from `apollo-airlines-apps` to reference `Service frontend` flips it to `True`. Delete the test route when done.
</details>

---

## Exercise 8: TLS properly: trust, hostname, and a deleted Secret

**Concepts:** [Ingress and TLS](./learn/networking/ingress-and-tls) · [Gateway API](./learn/networking/gateway-api)

**Goal:** prove HTTPS works for real (not just with `-k`), then show listeners fail independently.
**Time:** ~15 min · **Needs:** Substage 5 healthy.

1. **Predict:** after deleting the certificate Secret, does HTTP on port 80 keep working?
2. **Inspect:**

```bash
GW=$(kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.addresses[0].value}')
kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.listeners[?(@.name=="https")].conditions}' | jq -r '.[]|"\(.type)=\(.status)"'
kubectl -n apollo-airlines-apps get secret apollo-tls-secret -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/apollo-ca.crt
curl --cacert /tmp/apollo-ca.crt --resolve booking.apollo.local:443:$GW https://booking.apollo.local/readyz
curl --cacert /tmp/apollo-ca.crt --resolve untrusted.apollo.invalid:443:$GW https://untrusted.apollo.invalid/healthz; echo "exit=$?"
```

3. **Check:** listener conditions all `True`; booking `readyz` succeeds with verification on; the foreign hostname fails with **exit 60** (certificate valid for `*.apollo.local` only).
4. **Run a real passenger workflow over trusted HTTPS:**

```bash
R() { local h=$1; shift; curl -fsS --cacert /tmp/apollo-ca.crt --resolve $h:443:$GW "$@"; }
TOKEN=$(R identity.apollo.local -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' https://identity.apollo.local/api/users/login | jq -r .token)
R flight.apollo.local https://flight.apollo.local/api/flights | jq '.flights[0] | {flightNumber,origin,destination}'
```

   - A token prefix and a flight object print. (`/api/flights` returns `{"flights":[…]}`.)
5. **Inject: delete the Secret**

```bash
kubectl -n apollo-airlines-apps delete secret apollo-tls-secret
sleep 5
curl --cacert /tmp/apollo-ca.crt --resolve booking.apollo.local:443:$GW https://booking.apollo.local/readyz || echo "HTTPS failed (exit $?)"
kubectl get gateway apollo-gateway -n apollo-airlines-apps -o jsonpath='{.status.listeners[?(@.name=="https")].conditions[?(@.type=="ResolvedRefs")]}' | jq -c '{status,reason}'
curl -s -H "Host: booking.apollo.local" http://$GW/readyz
```

6. **Symptom:** HTTPS fails; `ResolvedRefs=False` with reason `InvalidCertificateRef`; **plain HTTP on port 80 still returns 200.**
7. **Fix and prove:**

```bash
bash stages/stage2/k8s/substages/03-traefik-ingress-tls/generate-certs.sh --context kind-apollo11
kubectl -n apollo-airlines-apps get secret apollo-tls-secret -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/apollo-ca.crt
curl --cacert /tmp/apollo-ca.crt --resolve booking.apollo.local:443:$GW https://booking.apollo.local/readyz
bash stages/stage2/scripts/verify-tls.sh
```

   - Final line: `Trusted HTTPS login, populated search, booking, cancellation, and hostname rejection passed.`
8. **Why:**
   - `-k` proves a TLS port answers, never that a browser would accept it.
   - Listeners are independent: HTTPS broke, HTTP did not. Check the **listener** condition before suspecting the app.
   - The new certificate is regenerated, so your saved CA copy must be refreshed (step 7). Trusting a stale CA is a common cause of "worked yesterday".
9. **Your turn:** the Gateway has both listeners. Without editing YAML, give two ways to prove HTTPS is not in use for `frontend → booking` calls from the browser today. (Hint: the frontend build args and a browser network tab.)

---

## Clean-up and baseline

- Leave Substage 5 running: Stage 3 builds on it.
- Baseline check: `kubectl get deploy -n apollo-airlines-apps` all ready; `kubectl get gateway -A` shows `Programmed=True`; `kubectl get svc -A | grep -E 'flight-alt|lb-test'` is empty.

## You can now

- [ ] Resolve any Service from any namespace and explain the search list.
- [ ] Read EndpointSlice `ready` conditions and link them to readiness probes.
- [ ] Tell 404 (no route) from 5xx (route OK, backend not) and from TLS faults.
- [ ] Say what fulfils `type: LoadBalancer` and what `<pending>` means.
- [ ] Read `Accepted`, `Programmed` and `ResolvedRefs` and fix the right object.

## Checkpoint

1. Which component rewrites a ClusterIP into a Pod IP?
2. A route in namespace A points to a Service in namespace B with no grant: which condition appears?
3. Why did `search` become unready when `flight` was scaled to 0?
4. What does `curl -k` fail to prove?

Next: [Stage 3: Mission Data](./stage-3).
