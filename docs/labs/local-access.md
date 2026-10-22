---
title: "Local Gateway and Browser Access"
description: "Choose an access route for native Linux or Docker Desktop, verify HTTPS, and remove local trust changes afterwards."
---

# Local Gateway and browser access

Use this reference after Stage 2 substage 5, or with a running Stage 3–7
Helm/Kustomize dev snapshot. Commands assume context `kind-apollo11` and
namespace `apollo-airlines-apps`. Argo uses different namespaces.

## Choose the route from your host

| Host | Gateway access | Passenger browser |
|---|---|---|
| Native Linux with Docker Engine | MetalLB IP, if the Docker network is routable from the host | Hostname mapping and local certificate trust, below |
| macOS/Windows with Docker Desktop | Use the HTTPS port-forward below; the MetalLB IP is inside Docker's VM | Direct Stage 2–7 Gateway browser access is not a verified course path; use the API workflow below |

Launchpad (`localhost:3000`) and Stage 1's mapped NodePorts are separate access
paths. Opening a port-forward to the frontend alone does not fix later-stage
browser access: its JavaScript calls the API hostnames on HTTPS port 443.

:::caution[Unverified]
The recipes below are checked against the pinned manifests and API workflow,
but have not received a fresh live run for this documentation change. The
recorded Stage 2 trusted-HTTPS verifier uses the direct MetalLB address.
Browser trust stores vary; do not interpret a successful port-forward health
check as proof of a complete browser workflow.
:::

## HTTPS through a local port-forward

This route needs kubectl, curl, jq and a free local port 18443. It keeps trust
local to each curl invocation and does not require hostname-file edits.
In one terminal, from the Apollo11 root:

```bash
kubectl config use-context kind-apollo11
ENVOY_SERVICE=$(kubectl -n envoy-gateway-system get svc \
  -l gateway.envoyproxy.io/owning-gateway-name=apollo-gateway \
  -o jsonpath='{.items[0].metadata.name}')
test -n "$ENVOY_SERVICE" && kubectl -n envoy-gateway-system \
  port-forward "svc/$ENVOY_SERVICE" 18443:443
```

Expect `Forwarding from 127.0.0.1:18443`. Leave that terminal running. In a
second terminal, use the same kubeconfig/context and run this in a Bash shell:

```bash
bash
CA_FILE=$(mktemp)
TLS_SECRET=apollo-tls-secret    # Stages 2–4; use apollo-edge-tls for Stages 5–7
kubectl -n apollo-airlines-apps get secret "$TLS_SECRET" \
  -o jsonpath='{.data.tls\.crt}' | base64 -d > "$CA_FILE"
route() {
  local host="$1" path="$2"
  shift 2
  curl --fail-with-body --silent --show-error --max-time 15 \
    --cacert "$CA_FILE" --resolve "$host:18443:127.0.0.1" \
    "$@" "https://$host:18443$path"
}
route frontend.apollo.local / -o /dev/null
route identity.apollo.local /healthz
```

The identity check should return HTTP success. A certificate failure means the
extracted certificate, hostname or listener is wrong; keep verification enabled.
Select a real available flight and make a reversible booking:

```bash
TOKEN=$(route identity.apollo.local /api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -er .token)
FLIGHT=$(route flight.apollo.local /api/flights | \
  jq -ec 'first(.flights[] | select(.status == "SCHEDULED" and .availableSeats > 0))')
FLIGHT_ID=$(printf '%s' "$FLIGHT" | jq -er .id)
SEARCH_QUERY=$(printf '%s' "$FLIGHT" | \
  jq -r '"origin=\(.origin | @uri)&destination=\(.destination | @uri)&date=\(.departureTime[:10] | @uri)"')
route search.apollo.local "/api/search?$SEARCH_QUERY" | jq '{total, results}'
BOOKING=$(route booking.apollo.local /api/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"flightId\":\"$FLIGHT_ID\"}")
printf '%s\n' "$BOOKING" | jq .
BOOKING_ID=$(printf '%s' "$BOOKING" | jq -er .id)
route booking.apollo.local "/api/bookings/$BOOKING_ID" \
  -X DELETE -H "Authorization: Bearer $TOKEN"
route booking.apollo.local "/api/bookings/$BOOKING_ID" \
  -H "Authorization: Bearer $TOKEN" | jq -e '.status == "CANCELLED"'
```

Require populated search results, a booking ID, `Booking cancelled` and a final
`true`. Stop at a failed command and inspect its response before proceeding.
If interrupted after creation, run the DELETE and final GET with the saved
booking ID before cleanup.

## Browser on a routable Linux host

1. Read the current address with `kubectl get gateway apollo-gateway -n apollo-airlines-apps -o wide`.
2. Confirm host reachability with `curl -H 'Host: frontend.apollo.local' http://<gateway-ip>/`.
   Replace `<gateway-ip>` with that address. If this times out, use the
   port-forward route; a hosts-file entry cannot repair routing.
3. Edit `/etc/hosts` with administrator privileges. Add one marked line, using
   the real address: `<gateway-ip> frontend.apollo.local identity.apollo.local flight.apollo.local booking.apollo.local search.apollo.local # Apollo11 lab`.
   Remove or update older entries for those names.
4. Extract the certificate as above. For a dedicated Firefox profile, open
   Settings → Privacy & Security → Certificates → View Certificates → Authorities,
   import the extracted certificate and enable trust for identifying websites.
   If the browser refuses it as an authority, use the curl route and retain the
   error rather than disabling certificate checks. Other browsers may use a
   different trust store; importing into one does not configure the others.
5. Open `https://frontend.apollo.local`. Sign in as
   `passenger@apolloairlines.com` / `pass123`, search a seeded route/date, book,
   then cancel. In Developer Tools → Network, require successful HTTPS API calls
   to the mapped service names, with no certificate or mixed-content failures.

Changing clusters or regenerating the TLS Secret can change the address and
certificate. Re-extract and compare them before updating mappings or trust.

## Clean up host changes

- Cancel any booking created above before removing access.
- Stop the port-forward with `Ctrl+C` in its terminal.
- In the Bash shell holding `CA_FILE`, run `rm -f "$CA_FILE"`, then `exit`.
  This restores the parent shell's variables.
- Remove the marked Apollo11 line from `/etc/hosts` if you added it. Remove the
  imported lab certificate from the browser's Authorities list, or delete the
  dedicated test profile. Removing the extracted file alone does not revoke
  browser trust.
- Run the installed stage's documented teardown when finished with the stage.

For failures, check the [networking troubleshooting flow](../troubleshooting)
and the stage's listener/route conditions before changing application code.
