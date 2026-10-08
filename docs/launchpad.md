---
title: "Launchpad — Container Foundations with Docker Compose"
description: "Run Apollo Airlines on one machine, then prove what survives restarts, what each name resolves to, and how a dependency failure spreads."
sidebar_label: "Launchpad (Docker Compose)"
---

# Build Launchpad: Apollo on Docker Compose

:::info[Page type · lab]
- Repo: `Apollo11` at commit `69113dcc80f77e32301d8ee7b9e73a67c923de96` ([setup](./labs/setup#prepare-the-verified-workspace)).
- Read the [Launchpad chapters](./learn/containers/process-image-container) first.
- All commands run from `Apollo11/stages/launchpad` unless stated.
:::

**Skill this lab builds:** given a symptom ("booking fails", "data vanished", "can't reach X"), say whether it is the process, the image, the network name, the storage, or a dependency.

## Setup (once)

```bash
cd stages/launchpad
cp .env.example .env
docker compose up --build -d
docker compose ps
```

- Expect 10 containers `Up (healthy)`: `frontend identity identity-db flight flight-db booking booking-db search notification redis`.
- Dozzle (log viewer) is in the optional `tools` profile and is not started.
- Published ports: `3000` frontend, `8080` identity, `8081` flight, `8082` booking, `8083` search, `8084` notification.
- `variable not set` error → you skipped `cp .env.example .env`.

## What to read before Exercise 1

| File | What to look for |
|---|---|
| `code/booking/Dockerfile` | Two stages (build, then runtime). `go.mod` copied **before** source so dependency layers cache. `USER apollo`. |
| `docker-compose.yml` → `booking` | `ports`, `environment` (service URLs by **name**), `read_only` + `tmpfs`, `cap_drop: ALL`, `healthcheck` on `/readyz`, `depends_on … service_healthy` (start order only). |
| `docker-compose.yml` → `frontend` | `VITE_*_URL` build args are `http://localhost:808x`: baked into JS for the **browser**. |
| `code/*/main.*` | Every service exposes `/healthz` (process alive) and `/readyz` (can do its job), plus `/metrics`. |

---

## Exercise 1: Prove each service is alive *and* ready

**Concepts:** [State and dependencies](./learn/containers/state-and-dependencies) · [Pod lifecycle](./learn/cluster/pod-lifecycle)

**Goal:** replace "docker says healthy" with direct evidence for all six APIs.
**Time:** ~5 min

1. **Predict:** which of `/healthz` and `/readyz` checks dependencies?
2. **Do:**

```bash
for p in 8080 8081 8082 8083 8084; do
  printf '%s  healthz=%s  readyz=%s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/healthz)" \
    "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/readyz)"
done
curl -s -o /dev/null -w 'frontend=%{http_code}\n' localhost:3000/
```

3. **Check:** every line shows `200` for both. Frontend `200`.
4. **Why:**
   - `/healthz` only says the web server answers.
   - `/readyz` also pings what the service needs. You will see the difference in Exercise 5.
5. **Your turn:** find which image a running container was built from, and prove that a rebuild does not touch a running container.

   - Hints: `docker compose ps -q booking`, `docker inspect -f '{{.Image}}' <id>`, `docker compose build booking`, `docker compose images booking`.
   - Then add a comment line to `code/booking/main.go`, rebuild, and note which Dockerfile steps print `CACHED`. Revert with `git checkout -- code/booking/main.go`.

<details>
<summary>Answer</summary>

After the rebuild, `docker compose images booking` shows a new image ID, but `docker inspect -f '{{.Image}}'` on the running container still shows the **old** ID until `docker compose up -d booking` recreates it. The `go mod download` step is `CACHED` because `go.mod` did not change; only the `COPY . .` and later steps rerun.
</details>

---

## Exercise 2: Make one booking and follow it through the logs

**Concepts:** [Networks and clients](./learn/containers/networks-and-clients)

**Goal:** trace a single request across four services by its request ID.
**Time:** ~10 min

1. **Predict:** which services will log your request ID? Which will not?
2. **Do:**

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -r .token)

RID=lab-$RANDOM
curl -s -X POST localhost:8082/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "X-Request-ID: $RID" \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' | tee /tmp/booking.json | jq .
sleep 1
docker compose logs booking identity flight notification | grep "$RID"
```

3. **Check:**
   - Response has `"status": "CONFIRMED"` and a `bookingReference` like `AA-2026-XXXXXX`.
   - The `grep` prints lines from `booking`, `identity`, `flight` and `notification` carrying the same ID.
4. **Why:**
   - Booking forwards `X-Request-ID` to every service it calls. This is a hand-rolled trace; Stage 6 replaces it with real tracing.
   - Order of calls: identity (who is this?) → flight (exists? seats) → booking-db insert → notification (async).
5. **Cancel it (clean state):**

```bash
curl -s -X DELETE localhost:8082/api/bookings/$(jq -r .id /tmp/booking.json) -H "Authorization: Bearer $TOKEN" | jq .
```

6. **Your turn:** book the same flight with a **bad** flight ID (`...-bbbb`), and with **no** token. Which service rejects each, and with what status code? Prove it from the logs, not from the response alone.

<details>
<summary>Answer</summary>

Bad flight: booking asks flight, which answers 404; booking returns 404 `Flight not found`. No token: booking's own auth middleware returns 401 before calling any other service, so identity/flight logs have no entry for that request ID.
</details>

---

## Exercise 3: Resolve the same name from three places

**Concepts:** [Networks and clients](./learn/containers/networks-and-clients)

**Goal:** show that `localhost` and service names mean different things to the host, the browser and a container.
**Time:** ~8 min

1. **Predict:** fill in the table with `ok` or `fail` before running anything.

| From | `localhost:8081` | `flight:8081` |
|---|---|---|
| Your host shell | ? | ? |
| Inside `booking` | ? | ? |

2. **Do:**

```bash
curl -s -o /dev/null -w 'host  -> localhost:8081 %{http_code}\n' localhost:8081/healthz
curl -s -o /dev/null -w 'host  -> flight:8081    %{http_code}\n' flight:8081/healthz || echo "host  -> flight:8081    cannot resolve"
docker compose exec booking wget -qO- http://localhost:8081/healthz || echo "booking -> localhost:8081 refused"
docker compose exec booking wget -qO- http://flight:8081/healthz
docker compose exec booking getent hosts flight booking-db
```

3. **Check:** host→`localhost` ok, host→`flight` fails; booking→`localhost` fails, booking→`flight` ok with `{"status":"ok"}`; `getent` prints private IPs (`172.x`).
4. **What does the browser use?**

```bash
docker compose exec frontend sh -c "grep -rhoE 'http://localhost:808[0-9]' /usr/share/nginx/html | sort -u"
```

   - The built JS contains `http://localhost:8080`…`8083`. The browser runs on your laptop, so it uses published ports, not Docker DNS.
5. **Why:**
   - Inside a container `localhost` is the container itself.
   - Docker's embedded DNS (`127.0.0.11`) resolves service names, only for containers on `apollo-airlines`.
   - `VITE_*` values are compiled into public JS: never put secrets there.
6. **Your turn:** from inside `search`, call booking's `/readyz` by service name. From your host, call it by published port. Write down both URLs and say which port number is the container's own.

<details>
<summary>Answer</summary>

```bash
docker compose exec search wget -qO- http://booking:8082/readyz
curl -s localhost:8082/readyz
```
Both end in `8082` here because the mapping is `8082:8082`. The left number is the host port, the right number is the container's. They are independent, and Kubernetes Services add a third number (`port` vs `targetPort`).
</details>

---

## Exercise 4: Which bytes survive which operation?

**Concepts:** [State and dependencies](./learn/containers/state-and-dependencies) · [Process, image, container](./learn/containers/process-image-container)

**Goal:** build the survival table for a container's writable layer, a named volume, and a database row.
**Time:** ~10 min

1. **Predict:** after (A) `restart` and (B) remove-and-recreate, which of these still exist?

| Data | A: restart | B: recreate |
|---|---|---|
| File in the container's own filesystem | ? | ? |
| File in the named volume | ? | ? |
| Row in the database | ? | ? |

2. **Write the three markers:**

```bash
docker compose exec identity-db sh -c 'echo layer > /opt/layer.txt; echo vol > /var/lib/postgresql/data/vol.txt'
docker compose exec identity-db psql -U postgres -d identity -c \
  "INSERT INTO users (email, password_hash, first_name) VALUES ('marker@apollo.local','x','Marker');"
```

3. **Test A (restart, same container):**

```bash
docker compose restart identity-db
until docker compose exec -T identity-db pg_isready -U postgres -d identity >/dev/null; do sleep 1; done
docker compose exec identity-db sh -c 'ls /opt/layer.txt /var/lib/postgresql/data/vol.txt'
```

4. **Test B (new container, same volume):**

```bash
docker compose rm -sf identity-db
docker compose up -d identity-db
until docker compose exec -T identity-db pg_isready -U postgres -d identity >/dev/null; do sleep 1; done
docker compose exec identity-db sh -c 'ls /opt/layer.txt; ls /var/lib/postgresql/data/vol.txt'
docker compose exec identity-db psql -U postgres -d identity -tc "SELECT email FROM users WHERE email='marker@apollo.local';"
```

5. **Check:**

| Data | A: restart | B: recreate |
|---|---|---|
| Container filesystem file | survives | **gone** (`No such file`) |
| Volume file | survives | survives |
| Database row | survives | survives |

6. **Clean up:**

```bash
docker compose exec identity-db psql -U postgres -d identity -c "DELETE FROM users WHERE email='marker@apollo.local';"
docker compose exec identity-db rm -f /var/lib/postgresql/data/vol.txt
```

7. **Why:**
   - A container's writable layer lives and dies with that **container**. A named volume belongs to Docker and outlives it.
   - This is the exact table Stage 1 (`emptyDir`) and Stage 3 (PVC) reproduce for Pods.

:::danger[Never during the course]
`docker compose down -v` deletes the named volumes and every database row in them. Plain `docker compose down` keeps them.
:::

8. **Your turn:** `booking` has `read_only: true` and `tmpfs: [/tmp]`. Predict whether a file in `/tmp` survives (A) and (B), then test it.

<details>
<summary>Answer</summary>

`tmpfs` is memory-backed and belongs to the container: a restart clears it, a recreate clears it. A read-only root filesystem rejects writes anywhere else (`touch /app/x` → `Read-only file system`).
</details>

---

## Exercise 5: Break a dependency and trace how readiness spreads

**Concepts:** [State and dependencies](./learn/containers/state-and-dependencies)

**Goal:** inject three different faults, predict which `/readyz` endpoints go red, and show that a red `/readyz` does not always mean a failed booking.
**Time:** ~15 min

1. **Predict** (write a ✓/✗ for each cell): after each fault, which `/readyz` return 503, and does `POST /api/bookings` still succeed?

| Fault | flight | search | notification | booking | Booking request works? |
|---|---|---|---|---|---|
| A: stop `flight-db` | ? | ? | ? | ? | ? |
| B: stop `redis` | ? | ? | ? | ? | ? |
| C: stop `notification` | ? | ? | n/a | ? | ? |

2. **Use this helper for every fault:**

```bash
ready() { for p in 8081 8083 8084 8082; do printf '%s=%s ' $p "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/readyz)"; done; echo; }
book() { curl -s -o /dev/null -w 'POST /api/bookings -> %{http_code}\n' -X POST localhost:8082/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}'; }
ready; book
```

   - Baseline: all `200`, booking `201`. (Re-export `TOKEN` from Exercise 2 if your shell is new. Cancel any booking you create the same way as in Exercise 2.)

3. **Fault A: database of a dependency**

```bash
docker compose stop flight-db
sleep 3; ready; book
curl -s localhost:8082/readyz        # read the detail
docker compose ps booking flight     # compose health column
docker compose start flight-db
```

   - Expect: `flight` 503, `search` 503, `booking` 503, `notification` 200. Booking POST → `502`, body `Flight service unavailable`.
   - `/healthz` on `flight` is still `200`: the process is fine, the dependency is not.
   - Compose may show `booking` as `unhealthy` but **does nothing about it**; `restart: always` only reacts to exit.

4. **Fault B: a dependency of a dependency**

```bash
docker compose stop redis
sleep 3; ready; book
curl -s localhost:8084/readyz
docker compose start redis
```

   - Expect: `notification` 503 (it pings Redis), and `booking` 503 because booking's `/readyz` calls notification's. `flight` and `search` stay 200.
   - Booking POST still returns `201`: notification is called asynchronously, after the booking row is written.

5. **Fault C: the optional dependency**

```bash
docker compose stop notification
sleep 3; ready; book
docker compose start notification
```

   - Expect: `booking` 503, but POST `201`.

6. **Recover and prove:**

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:8082/readyz)" = 200 ]; do sleep 2; done
ready; book
```

   - All `200`, booking `201`. (Cancel bookings you made.)

7. **Why:**
   - `/readyz` reports the **declared dependency graph**, not whether this one request would work. A red `/readyz` and a failing request are different facts.
   - Kubernetes will use `/readyz` to decide where traffic goes (Stage 1, Stage 4). Choosing which dependencies belong in it is a design decision with consequences: here a Redis outage makes booking "unready" though bookings still succeed.

8. **Your turn:** look at `booking`'s `/readyz` handler (`code/booking/main.go`, ~line 190). Which one-line change would stop a notification outage from marking booking unready? What would you lose?

<details>
<summary>Answer</summary>

Remove the `notification` entry from the `dependencies` slice. Booking then reports ready during notification outages and passengers can book, but nobody notices confirmation emails are not being processed unless notification has its own alert.
</details>

---

## Exercise 6: Kill a container vs remove it

**Concepts:** [Process, image, container](./learn/containers/process-image-container)

**Goal:** show what Compose's `restart: always` does and does not do, the gap Kubernetes controllers fill.
**Time:** ~6 min

1. **Predict:** (A) you `kill` the booking container. (B) you `rm -f` it. Which one comes back by itself?
2. **A: kill the process**

```bash
ID=$(docker compose ps -q booking)
docker kill "$ID"
sleep 5
docker compose ps booking
docker inspect -f 'restarts={{.RestartCount}} started={{.State.StartedAt}}' "$ID"
```

   - Same container ID, `RestartCount` is 1 or more, `Up`. The Docker daemon applied the restart policy.
3. **B: remove the container**

```bash
docker rm -f "$ID"
sleep 5
docker compose ps booking     # empty
curl -s -o /dev/null -w 'booking readyz=%{http_code}\n' localhost:8082/readyz || echo "booking: connection refused"
```

   - It stays gone.
4. **Recover and prove:**

```bash
docker compose up -d booking
until [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:8082/readyz)" = 200 ]; do sleep 2; done; echo booking ready
```

5. **Why:**
   - Restart policy restarts a **container that exited**. Nothing watches for a **missing** container; a person must run `up` again.
   - Replace "Docker daemon" with "kubelet" and you have Ignition's bare-Pod result. Replace "you" with "ReplicaSet controller" and you have Stage 1.
6. **Your turn:** run `docker compose stop identity`, then `docker compose ps`. Does `restart: always` start it again? What does that tell you about an *intended* stop vs a crash?

<details>
<summary>Answer</summary>

It stays stopped. The daemon distinguishes an explicit stop from an unexpected exit. Start it with `docker compose start identity`.
</details>

---

## Exercise 7: Probe the sandbox

**Concepts:** [Process, image, container](./learn/containers/process-image-container) · [Images and configuration](./learn/containers/images-and-configuration)

**Goal:** verify the hardening settings in the Compose file actually hold.
**Time:** ~4 min

```bash
docker compose exec booking id
docker compose exec booking touch /app/x            ; echo "exit=$?"
docker compose exec booking touch /tmp/x && echo "/tmp writable"
docker inspect -f 'readonly={{.HostConfig.ReadonlyRootfs}} caps_dropped={{.HostConfig.CapDrop}} secopt={{.HostConfig.SecurityOpt}}' $(docker compose ps -q booking)
```

- Expect: user `apollo` (not root), `Read-only file system` on `/app`, `/tmp` writable, `readonly=true caps_dropped=[ALL] secopt=[no-new-privileges:true]`.
- Each setting removes something an attacker would use. None of them is a guarantee against container escape.
- **Your turn:** the same `id` against `identity-db`. Why is that container allowed to run as root?

<details>
<summary>Answer</summary>

The official `postgres` image starts as root to prepare its data directory, then drops to the `postgres` user. This stage does not harden database containers; Stage 8 revisits that in Kubernetes.
</details>

---

## Why Compose is not enough

| Need | Compose | Kubernetes (next stages) |
|---|---|---|
| Many machines | One host | Scheduler picks nodes |
| Missing container | Stays missing (Exercise 6) | Controller recreates it |
| Rolling update | Stop old, start new | Surge Pods + readiness gate |
| Storage | Host volumes | PVCs and StatefulSets |
| Routing | Port publishing | Services, Gateway API |

## You can now

- [ ] Say what survives restart vs recreate for filesystem, volume and DB data.
- [ ] Explain why `localhost` differs for host, browser and container.
- [ ] Predict how a dependency outage spreads through `/readyz`.
- [ ] Say who restarts a crashed container and who does **not** replace a missing one.

## Checkpoint

1. `flight-db` stops. Which `/healthz` fails? Which `/readyz`? What does a booking request return?
2. Why can the browser not call `http://booking:8082`?
3. What does `docker compose down` delete? What does `down -v` add?
4. Which Compose feature restarted a killed container, and why did it not restart a removed one?

Stop Launchpad before creating a cluster:

```bash
docker compose down
```

Next: [Ignition](./ignition).
