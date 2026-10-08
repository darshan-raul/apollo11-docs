---
title: "Launchpad — Container Foundations with Docker Compose"
description: "Package Apollo Airlines into images and run all ten components on one machine with Docker Compose, and understand what Compose gives you and where it stops."
sidebar_label: "Launchpad (Docker Compose)"
---

# Launchpad: Apollo on Docker Compose

:::info[Page type · stage walkthrough]
- Repo folder: [`stages/launchpad`](https://github.com/darshan-raul/Apollo11/tree/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/launchpad) at the [pinned commit](./labs/setup#prepare-the-verified-workspace). Run commands from `stages/launchpad` unless stated.
- Builds on: nothing. This is the start. You need Docker with Compose, `curl` and `jq`.
- Concepts behind this stage: [Process, image, container](./learn/containers/process-image-container) · [Images and configuration](./learn/containers/images-and-configuration) · [Networks and clients](./learn/containers/networks-and-clients) · [State and dependencies](./learn/containers/state-and-dependencies) · [Least privilege for containers](./learn/containers/least-privilege)
:::

## Where we left off

Before Launchpad, an app like Apollo Airlines would be run by hand:

- Install Go, Python, Node.js, PostgreSQL and Redis on your own machine, at the right versions.
- Start six services in six terminals, in the right order.
- Point them at each other with `localhost:<port>`, and export passwords in your shell.
- It works on your machine. On the next person's machine, a different version or a missing variable breaks it.

Launchpad packages each service into an **image** (a read-only bundle of the program and everything it needs) and describes the whole system in one file, so it starts the same way everywhere.

## What changes in this stage

| Concern | Before (by hand) | Launchpad | Why it's better |
|---|---|---|---|
| Installing runtimes | Go, Python, Node, Postgres, Redis on the host | **Dockerfile** per service; images carry their own runtime | Nothing to install but Docker; same image on every machine |
| Starting the system | Ten processes, started one by one | **`docker compose up`** reads `docker-compose.yml` | One command, one file you can review |
| Finding another service | `localhost:<port>` | **Service name** (`flight`, `booking-db`) on the `apollo-airlines` network | Names don't change when containers are recreated |
| Config and secrets | Shell exports | **`environment:`** blocks, secrets from a git-ignored `.env` | Config sits next to the service it belongs to |
| Start order | You remember it | **`depends_on: … condition: service_healthy`** | A service starts only after its dependencies report healthy |
| "Is it working?" | Is the process up? | **`healthcheck`** on `/readyz` | Health means "can do its job", not only "is running" |
| Crashes | You notice and restart | **`restart: always`** | The Docker daemon restarts a container that exits |
| Database storage | Wherever local Postgres keeps it | **Named volumes** `*-db-data` | Data outlives the container |
| Sandbox | Runs as you, can write anywhere | **Non-root `USER`, `read_only`, `cap_drop: ALL`, `no-new-privileges`** | Less for an attacker to use if a service is compromised |

## What's in the folder

| Path | What it is | New or replaces |
|---|---|---|
| `code/{identity,flight,booking,search,notification}/` | Five API services (identity is Python, the rest Go), each with a `Dockerfile` | Replaces running source code on the host |
| `code/frontend/` | React UI, built with Vite and served by nginx | Replaces a local dev server |
| `code/*/init.sql` | Schema and seed data for identity, flight and booking databases | Mounted into Postgres on first start |
| `docker-compose.yml` | All ten workloads, their network, volumes and health checks | Replaces the start-up checklist in your head |
| `.env.example` | Names of the three required secrets | Copied to `.env` (git-ignored) |
| `scripts/verify.sh` | Automated check of health, hardening and a booking round trip | — |

The ten workloads: six application services (`frontend`, `identity`, `flight`, `booking`, `search`, `notification`), three PostgreSQL databases (`identity-db`, `flight-db`, `booking-db`) and `redis`. Dozzle, a log viewer, sits in an optional `tools` profile and is not started by default.

## Walkthrough

### Step 1: Read one service end to end before starting anything

The application shape:

```text
Browser :3000
    │
    ├── identity :8080 ───────────────► identity-db :5432
    ├── flight :8081 ─────────────────► flight-db :5432
    ├── search :8083 ─────────────────► flight :8081
    └── booking :8082
          ├── identity :8080
          ├── flight :8081
          ├── booking-db :5432
          └── notification :8084 ─────► redis :6379
```

Booking has the most dependencies, so follow it. First its image, [`code/booking/Dockerfile`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/launchpad/code/booking/Dockerfile):

```dockerfile
FROM golang:1.22-alpine AS builder      # stage 1: has the Go compiler
WORKDIR /app
COPY go.mod go.sum ./                   # dependency list first...
RUN go mod download                     # ...so this layer is cached until go.mod changes
COPY . .                                # then the source code
RUN CGO_ENABLED=0 GOOS=linux go build -o /booking-service

FROM alpine:3.19                        # stage 2: small runtime, no compiler
RUN apk --no-cache add ca-certificates \
    && addgroup -S apollo \
    && adduser -S -G apollo apollo      # an unprivileged user
WORKDIR /app
COPY --from=builder --chown=apollo:apollo /booking-service /app/booking-service
EXPOSE 8082
USER apollo                             # the process does not run as root
CMD ["/app/booking-service"]
```

Then how it runs, in [`docker-compose.yml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/launchpad/docker-compose.yml):

```yaml
# docker-compose.yml → booking (trimmed)
booking:
  build: {context: ./code/booking}      # build the image above
  restart: always                       # restart the container if it exits
  ports: ["8082:8082"]                  # host port : container port
  environment:
    DATABASE_URL: postgresql://${POSTGRES_USER:?…}:${POSTGRES_PASSWORD:?…}@booking-db:5432/booking
    FLIGHT_SERVICE_URL: http://flight:8081          # a service name, not localhost
    IDENTITY_SERVICE_URL: http://identity:8080
    NOTIFICATION_SERVICE_URL: http://notification:8084
    JWT_SECRET: ${JWT_SECRET:?…}        # filled in from .env
  read_only: true                       # root filesystem cannot be written
  tmpfs: [/tmp]                         # except a small in-memory /tmp
  security_opt: [no-new-privileges:true]
  cap_drop: [ALL]                       # no Linux capabilities
  healthcheck:
    test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:8082/readyz"]
  depends_on:
    booking-db:   {condition: service_healthy}
    flight:       {condition: service_healthy}
    identity:     {condition: service_healthy}
    notification: {condition: service_healthy}
  networks: [apollo-airlines]
```

- **What it is:** a recipe for the image (Dockerfile) and a description of one running copy of it (the Compose service).
- **Image vs container:** the image is the built file system and start command. A container is one running copy of it. Rebuilding the image does not touch a running container; `docker compose up -d booking` recreates it from the new image.
- **Why two build stages:** the compiler is needed to build, not to run. The final image holds only the binary and a small Alpine base.
- **Why `go.mod` is copied first:** Docker caches each step. If only source code changes, `go mod download` is reused and the build is fast.
- **Why service names:** `http://flight:8081` works because Docker runs a DNS server for containers on the same network. Every Kubernetes stage keeps this exact URL, only the thing behind the name changes.
- **Why `${VAR:?…}`:** Compose refuses to start if the variable is missing (the `…` is the message `Copy .env.example to .env`), instead of starting with an empty password.
- The [Images and configuration](./learn/containers/images-and-configuration) chapter covers layers, build args and runtime config in depth.

### Step 2: Create the secrets file and start everything

```bash
cd stages/launchpad
cp .env.example .env          # then change the example values
docker compose up --build --wait -d
docker compose ps
```

- **What happens:** Compose builds six images, creates the `apollo-airlines` network and three named volumes, then starts containers in `depends_on` order. `--wait` returns once all are healthy. The first build can take several minutes.
- **What you see:** ten containers `Up (healthy)`.
- **Why `.env`:** `POSTGRES_USER`, `POSTGRES_PASSWORD` and `JWT_SECRET` stay out of Git. Use URL-safe characters in the password, because it is embedded in `DATABASE_URL`.
- **If you see `variable not set`:** `.env` is missing.
- **Ports on your host:** `3000` frontend, `8080` identity, `8081` flight, `8082` booking, `8083` search, `8084` notification.

### Step 3: See the difference between alive and ready

Every service exposes `/healthz`, `/readyz` and `/metrics`:

```bash
for p in 8080 8081 8082 8083 8084; do
  printf '%s  healthz=%s  readyz=%s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/healthz)" \
    "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/readyz)"
done
curl -s localhost:8081/metrics | head
```

- **`/healthz`:** the web server answers. It says the process is alive.
- **`/readyz`:** the service can do its job. It also checks what the service needs: flight checks its database; booking checks its database plus identity, flight and notification.
- **Why two endpoints:** a process can be alive but useless, for example when its database is down. Step 7 shows this.
- **`/metrics`:** Prometheus text format, deliberately minimal until Stage 6.
- **Compared with by hand:** Compose's `healthcheck` runs `/readyz` on a timer and shows the result in `docker compose ps`. Kubernetes turns the same two endpoints into probes later.

### Step 4: Make one booking and follow it through the logs

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' | jq -r .token)

RID=launchpad-$RANDOM
curl -s -X POST localhost:8082/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "X-Request-ID: $RID" \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' | tee /tmp/booking.json | jq .
sleep 1
docker compose logs booking identity flight notification | grep "$RID"
```

- **What you see:** a booking with `"status": "CONFIRMED"` and a `bookingReference` like `AA-2026-XXXXXX`, and log lines from four services carrying the same request ID.
- **What happens, in order:** booking checks its own auth, then asks identity who you are, asks flight whether the flight exists, writes the row to `booking-db`, and tells notification (asynchronously, after the row is written).
- **Why the request ID:** booking forwards `X-Request-ID` to every service it calls. It is a hand-made trace. Stage 6 replaces it with real tracing.
- **The UI does the same:** open `http://localhost:3000`, log in with the same account. The browser calls the same APIs.

Cancel the booking to keep the data clean:

```bash
curl -s -X DELETE localhost:8082/api/bookings/$(jq -r .id /tmp/booking.json) -H "Authorization: Bearer $TOKEN" | jq .
```

### Step 5: See what a name means from each place

```bash
curl -s localhost:8081/healthz                                   # host: works
curl -s flight:8081/healthz || echo "host cannot resolve flight" # host: no Docker DNS
docker compose exec booking wget -qO- http://flight:8081/healthz # container: works
docker compose exec booking wget -qO- http://localhost:8081/healthz || echo "refused"
docker compose exec booking getent hosts flight booking-db       # private 172.x IPs
docker compose exec frontend sh -c "grep -rhoE 'http://localhost:808[0-9]' /usr/share/nginx/html | sort -u"
```

| From | `localhost:8081` | `flight:8081` |
|---|---|---|
| Your host shell | works (published port) | fails (no Docker DNS on the host) |
| Inside `booking` | fails (`localhost` is booking itself) | works (Docker DNS at `127.0.0.11`) |
| The browser | works (it runs on your laptop) | fails |

- **Why the frontend uses `localhost:808x`:** the `VITE_*_URL` build args are compiled into the JavaScript. That code runs in your browser, on your laptop, so it must use published ports. Never put secrets in `VITE_*` values; they are public.
- **Two port numbers:** in `8082:8082`, the left number is the host port and the right one is the container's. They are independent. Kubernetes Services add a third (`port` vs `targetPort`).
- More in [Networks and clients](./learn/containers/networks-and-clients).

### Step 6: See which data survives a restart and a recreate

```bash
# Write a file into the container's own filesystem, and one into the named volume
docker compose exec identity-db sh -c 'echo layer > /opt/layer.txt; echo vol > /var/lib/postgresql/data/vol.txt'
docker compose exec identity-db sh -c 'psql -U "$POSTGRES_USER" -d identity -tc "SELECT count(*) FROM users;"'

# Remove the container entirely and create a new one
docker compose rm -sf identity-db
docker compose up -d --wait identity-db
docker compose exec identity-db sh -c 'ls /opt/layer.txt; ls /var/lib/postgresql/data/vol.txt'
docker compose exec identity-db sh -c 'psql -U "$POSTGRES_USER" -d identity -tc "SELECT count(*) FROM users;"'
docker compose exec identity-db rm -f /var/lib/postgresql/data/vol.txt   # tidy up
```

| Data | `docker compose restart` (same container) | Remove and recreate (new container) |
|---|---|---|
| File in the container's filesystem | survives | **gone** |
| File in the named volume | survives | survives |
| Database rows (in the volume) | survive | survive |
| `/tmp` on `booking` (`tmpfs`) | gone | gone |

- **Why:** a container's writable layer belongs to that container. A named volume belongs to Docker and outlives any container that uses it.
- **Why `init.sql` didn't run again:** Postgres runs init scripts only when its data directory is empty. The volume was not empty.
- **Where this comes back:** Stage 1 runs databases on `emptyDir` (lives with the Pod, like the writable layer here). Stage 3 brings back volume-like behaviour with PersistentVolumeClaims.

:::danger[Never during the course]
`docker compose down -v` deletes the named volumes and every database row in them. Plain `docker compose down` keeps them.
:::

### Step 7: See how a dependency failure spreads

```bash
ready() { for p in 8081 8083 8084 8082; do printf '%s=%s ' $p "$(curl -s -o /dev/null -w '%{http_code}' localhost:$p/readyz)"; done; echo; }
docker compose stop flight-db
sleep 3; ready
curl -s localhost:8081/healthz      # still 200
curl -s localhost:8082/readyz       # the reason booking is unready
docker compose ps booking flight
docker compose start flight-db
```

What you see, and what the same outage does for other dependencies:

| Stopped | flight `/readyz` | search | notification | booking | `POST /api/bookings` |
|---|---|---|---|---|---|
| `flight-db` | 503 | 503 | 200 | 503 | `502 Flight service unavailable` |
| `redis` | 200 | 200 | 503 | 503 | still `201` |
| `notification` | 200 | 200 | — | 503 | still `201` |

- **What it means:** `/readyz` reports the declared dependency graph, not whether one particular request would work. Booking calls notification after the booking is saved, so a Redis outage marks booking unready even though bookings still succeed.
- **Why this matters later:** Kubernetes uses `/readyz` to decide which Pods get traffic (Stage 1), and Stage 4 adds liveness and startup probes on top. Which dependencies belong in `/readyz` is a design choice with consequences.
- **What Compose does about it:** `docker compose ps` shows `unhealthy`, and nothing else happens. `restart: always` only reacts to a container that *exits*.

Wait for recovery before moving on:

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:8082/readyz)" = 200 ]; do sleep 2; done; ready
```

### Step 8: See what `restart: always` does and does not do

```bash
ID=$(docker compose ps -q booking)
docker kill "$ID"; sleep 5
docker inspect -f 'restarts={{.RestartCount}} running={{.State.Running}}' "$ID"   # same ID, back up

docker rm -f "$ID"; sleep 5
docker compose ps booking            # empty: it stays gone
docker compose up -d --wait booking  # a person has to bring it back
```

- **Killed process:** same container ID, `RestartCount` goes up. The Docker daemon applied the restart policy.
- **Removed container:** nothing watches for a *missing* container. It stays missing until someone runs `up`.
- **An intended stop is respected too:** `docker compose stop` is not treated as a crash.
- **Why this matters:** this is the gap orchestration fills. In Ignition the kubelet plays the daemon's role for one Pod. In Stage 1 a controller plays *your* role and replaces what is missing.

### Step 9: See the sandbox settings hold

```bash
docker compose exec booking id                                    # uid of apollo, not root
docker compose exec booking touch /app/x                          # Read-only file system
docker compose exec booking touch /tmp/x && echo "/tmp writable"
docker inspect -f 'readonly={{.HostConfig.ReadonlyRootfs}} caps={{.HostConfig.CapDrop}} secopt={{.HostConfig.SecurityOpt}}' \
  $(docker compose ps -q booking)
```

- **What you see:** user `apollo`, writes to `/app` rejected, `/tmp` writable, `readonly=true caps=[ALL] secopt=[no-new-privileges:true]`.
- **Why:** each setting removes something an attacker could use. None is a guarantee against escape.
- **Why `identity-db` runs as root:** the official `postgres` image starts as root to prepare its data directory, then drops to the `postgres` user. Database containers are not hardened in this stage.
- **Why Dozzle is optional:** it mounts the Docker socket. Access to that socket is close to root on the host, even when the mount is read-only.
- **Where this comes back:** Kubernetes expresses the same controls as `securityContext`. Stage 8 makes them explicit and enforced. More in [Least privilege for containers](./learn/containers/least-privilege).

## When something looks wrong

| You see | Likely cause | First command |
|---|---|---|
| `variable not set` on `up` | No `.env` file | `cp .env.example .env` |
| Container `unhealthy`, process running | A dependency is down; `/readyz` fails | `curl -s localhost:<port>/readyz` |
| Container keeps restarting | App exits on start (bad URL, DB unreachable) | `docker compose logs --tail=80 <service>` |
| Database password rejected after editing `.env` | Postgres kept the old credentials in its volume | `docker compose down --volumes`, then `up` (deletes data) |
| `Connection refused` from inside a container to `localhost` | `localhost` is that container | Use the service name: `http://flight:8081` |
| Port already allocated | Something else on the host uses 3000 or 808x | `docker compose ps --all`, then stop the other process |

The [troubleshooting page](./troubleshooting) has more.

## What this stage does not solve yet

| Limitation you can see now | Why it hurts | Fixed in |
|---|---|---|
| Everything runs on one Docker host | That host is a single point of failure and a hard size limit | [Ignition](./ignition): a cluster of nodes |
| A removed container stays removed | Recovery needs a person | [Stage 1](./stage-1): Deployments and ReplicaSets |
| `unhealthy` changes nothing | Traffic still goes to a container that can't serve | [Stage 1](./stage-1) readiness, [Stage 4](./stage-4) probes |
| Updates are stop old, start new | A short outage on every release | [Stage 1](./stage-1): rolling updates |
| One published port per service; browser uses `localhost:808x` | No single front door, no hostnames, no TLS | [Stage 2](./stage-2): Ingress, Gateway API |
| Volumes live on this host's disk | Data can't follow a workload to another machine | [Stage 3](./stage-3): PVCs and StatefulSets |
| Secrets in a plain `.env` file | Anyone with the file has the password | [Stage 1](./stage-1) Secrets, Stage 8 (planned): Vault |
| `/metrics` is collected by nobody | You find problems from logs, by hand | [Stage 6](./stage-6): observability |

## The journey so far

| Concern | Before (by hand) | **Launchpad** |
|---|---|---|
| Runs on | Your machine, with every runtime installed | **One Docker host** |
| Unit of deployment | A process | **Compose service** (image + container) |
| Recovery | You restart it | **`restart:` on one host** |
| Service discovery | `localhost:<port>` | **Docker DNS** |
| External access | Whatever port the process opened | **`ports:`** |
| Config / secrets | Shell exports | **`environment:` + `.env`** |
| Data | Local database files | **Named volume** |

## Clean up

```bash
./scripts/verify.sh          # optional: the full automated check
docker compose down          # keeps the named volumes
```

Stop Launchpad before creating the cluster: Ignition's kind nodes also run on Docker. Use `docker compose down --volumes` only when you want a fresh start; it deletes the database data.

## You should now be able to explain

- Why booking calls `http://flight:8081` and the browser calls `http://localhost:8081`.
- What an image is, what a container is, and why rebuilding an image doesn't change a running container.
- Why `/healthz` can pass while `/readyz` fails, and why a Redis outage marks booking unready.
- Which data survives a restart, a recreate, `down`, and `down -v`.
- What `restart: always` reacts to, and what it ignores.
- Which Compose features turn into Deployments, Services, ConfigMaps, Secrets, probes and PVCs.

**Next:** [Ignition](./ignition) builds a three-node Kubernetes cluster and runs the first Pod.
