---
title: "Launchpad — Docker Compose"
description: "Build, run, inspect, break, and recover Apollo Airlines locally with Docker Compose before moving to Kubernetes."
---

# Launchpad: Docker Compose

**Goal:** Run Apollo Airlines locally, trace requests across containers, inspect container hardening, and understand the application architecture before Kubernetes orchestrates it in later stages.

Launchpad establishes the baseline for all **10 workloads** used throughout the course: six application microservices, three PostgreSQL databases, and Redis. It also includes an optional log viewer (Dozzle) as a learning aid.

---

## The Learner Mission

By the end of this lab you will have:
1. Built the container images from multi-stage Dockerfiles.
2. Started all 10 workloads and inspected their shared bridge network.
3. Authenticated as a seeded passenger and traced an API booking across multiple services.
4. Inspected container security defaults: non-root users and read-only root filesystems.
5. Executed a safe failure experiment: stopped a database and observed cascading readiness failures while liveness remained green.
6. Restored the database and verified observable application recovery.
7. Proved data persistence across container deletion using named Docker volumes.
8. Run the automated 73-check verification test suite.

---

## Concept Mapping: Compose to Kubernetes

| Docker Compose Concept | Where to Inspect | What Kubernetes Replaces It With |
|---|---|---|
| `Dockerfile` | `code/*/Dockerfile` | Container image executed inside a Kubernetes Pod |
| Compose service | `docker-compose.yml` | `Deployment` (stateless) or `StatefulSet` (stateful) |
| `environment` block | service env definitions | `ConfigMap` and `Secret` |
| Service-name DNS | `http://flight:8081` | Kubernetes `Service` and CoreDNS in-cluster FQDN |
| `healthcheck` block | PostgreSQL / Redis healthchecks | `startupProbe`, `livenessProbe`, `readinessProbe` |
| Named volume | `identity-db-data` | `PersistentVolumeClaim` (PVC) and `StorageClass` |
| Shared network | `apollo-airlines` bridge network | Pod network CNI and cluster CIDR |
| Hardening (`user`, `read_only`) | container security settings | Pod `securityContext` and Linux capabilities |

---

## Prerequisites

Check your local toolchain from your terminal:

```bash
docker version
docker compose version
curl --version
jq --version
```

:::tip Devbox Support
If you prefer not to install CLI tools manually, Apollo11 includes a `devbox.json` configuration:
```bash
# Install Devbox (optional)
curl -fsSL https://get.jetify.com/devbox | bash
devbox shell
```
:::

### Configure Local Environment Secrets

Before starting Compose, create your local `.env` configuration from the provided template:

```bash
cd stages/launchpad
cp .env.example .env
```

Open `.env` in your editor. Notice that `.env` defines development credentials:
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`
- `JWT_SECRET=supersecretjwtkey`

:::caution URL-Safe Passwords
If you customize `POSTGRES_PASSWORD`, use URL-safe alphanumeric characters. Docker Compose embeds this variable into database connection strings (`postgresql://user:pass@host:5432/db`).
:::

---

## 1. Architecture & Service Topology

```mermaid
graph TB
    subgraph Client
        Browser([Browser :3000])
    end

    subgraph App Services
        ID([identity :8080])
        FL([flight :8081])
        BK([booking :8082])
        SN([search :8083])
        NT([notification :8084])
        FE([frontend :3000])
    end

    subgraph Databases & Queues
        IDDB[(identity-db :5432)]
        FLDB[(flight-db :5432)]
        BKDB[(booking-db :5432)]
        RD[(redis :6379)]
    end

    Browser --> FE
    Browser --> ID
    Browser --> FL
    Browser --> BK
    Browser --> SN

    FE --> ID
    FE --> FL
    FE --> BK
    FE --> SN

    BK --> ID
    BK --> FL
    BK --> BKDB
    BK --> NT

    SN --> FL
    NT --> RD

    ID --> IDDB
    FL --> FLDB
```

### Workload Inventory

| Service | Language / Stack | Port | Database | Role |
|---|---|---|---|---|
| **frontend** | React 18, Vite, Tailwind, NGINX | 3000 | — | Single-page application UI |
| **identity** | Python 3.12, FastAPI | 8080 | `identity-db` | User authentication, passenger profiles, JWT issuance |
| **flight** | Go 1.22, Gin | 8081 | `flight-db` | Flight schedules, airports, seat reservation |
| **booking** | Go 1.22, Gin | 8082 | `booking-db` | Flagship booking coordinator |
| **search** | Go 1.22, Gin | 8083 | — | Flight search proxy (Redis cache added in Stage 7) |
| **notification** | Go 1.22, Gin | 8084 | — | Asynchronous event worker |
| **identity-db** | PostgreSQL 15 Alpine | 5432 | Volume | `users` table |
| **flight-db** | PostgreSQL 15 Alpine | 5432 | Volume | `airports` and `flights` tables |
| **booking-db** | PostgreSQL 15 Alpine | 5432 | Volume | `bookings` table |
| **redis** | Redis 7 Alpine | 6379 | Volume | Notification queue |

---

## 2. Build and Start Apollo Airlines

Run Docker Compose to build images and launch all 10 containers in detached mode:

```bash
cd stages/launchpad
docker compose up --build --wait -d
```

Check the running status of every container:

```bash
docker compose ps
```

All 10 workloads should report `healthy` or `running`:
```text
NAME                                 IMAGE                          COMMAND                  SERVICE         STATUS
launchpad-booking-1                  launchpad-booking              "/app/booking-service"   booking         Up (healthy)
launchpad-booking-db-1               postgres:15-alpine             "docker-entrypoint.s…"   booking-db      Up (healthy)
launchpad-flight-1                   launchpad-flight               "/app/flight-service"    flight          Up (healthy)
launchpad-flight-db-1                postgres:15-alpine             "docker-entrypoint.s…"   flight-db       Up (healthy)
launchpad-frontend-1                 launchpad-frontend             "/docker-entrypoint.…"   frontend        Up
launchpad-identity-1                 launchpad-identity             "uvicorn main:app --…"   identity        Up (healthy)
launchpad-identity-db-1              postgres:15-alpine             "docker-entrypoint.s…"   identity-db     Up (healthy)
launchpad-notification-1             launchpad-notification         "/app/notification-s…"   notification    Up (healthy)
launchpad-redis-1                    redis:7-alpine                 "docker-entrypoint.s…"   redis           Up (healthy)
launchpad-search-1                   launchpad-search               "/app/search-service"    search          Up (healthy)
```

If any service encounters issues, inspect its recent logs:

```bash
docker compose logs --tail=50 identity identity-db
```

---

## 3. Inspect the System & Security Defaults

Don't just trust green containers — verify the network, process identity, and filesystem boundaries.

### Check Service Discovery & Network Isolation

Every container connects to a shared user-defined bridge network `launchpad_apollo-airlines`:

```bash
# Inspect the Docker network
docker network inspect launchpad_apollo-airlines

# Test internal DNS resolution from the booking service to flight service
docker compose exec booking getent hosts flight
```

Notice that `booking` resolves `flight` to an internal IP (e.g., `172.x.x.x`), not `localhost`.

### Verify Non-Root Runtime Users

Every application Dockerfile defines a dedicated, unprivileged user (`appuser` with UID 10001 or `nginx`):

```bash
# Verify booking runs as non-root
docker compose exec booking id
# Expected: uid=10001(appuser) gid=10001(appuser)

# Verify identity runs as non-root
docker compose exec identity id
# Expected: uid=10001(appuser) gid=10001(appuser)

# Verify frontend runs as nginx
docker compose exec frontend id
# Expected: uid=101(nginx) gid=101(nginx)
```

### Verify Read-Only Root Filesystems

Application containers mount root filesystems in read-only mode to prevent runtime tampering. Temporary writable scratch space is limited to tmpfs `/tmp`:

```bash
# Attempt to write to the container filesystem
docker compose exec booking sh -c \
  'touch /app/should-fail 2>/dev/null || echo "expected: /app is read-only"'
# Expected output: expected: /app is read-only
```

### Optional Log Viewer (Dozzle)

Dozzle provides an optional browser-based UI to tail container logs at `http://localhost:8085`:

```bash
docker compose --profile tools up -d dozzle
```

:::warning Security Note
Dozzle requires mounting the Docker host socket (`/var/run/docker.sock`). Even with a read-only mount, exposing the Docker socket provides privileged control over the host daemon. For this reason, Dozzle is isolated behind the `--profile tools` flag and excluded from default production workflows.
:::

---


### Note on Authentication & JWT Validation

A critical design pattern in Apollo Airlines is that **JWT validation is decentralized**:
- When a user logs in, the **Identity Service** issues a JWT containing claims (e.g., `sub`, `role`) signed by the `JWT_SECRET`.
- When the user calls the **Booking Service**, the Booking Service parses the JWT and **verifies the cryptographic signature locally** using its own copy of the `JWT_SECRET`.
- The Booking Service does *not* make a network call to the Identity Service to validate the token. It only makes a network call (GET `/api/users/{id}`) to confirm the user account is still active (`is_active = true`).
- For internal service-to-service calls (like Booking calling Flight to decrement seats), Booking mints a short-lived internal JWT with `role=SERVICE`.

This decentralized validation prevents the Identity Service from becoming a performance bottleneck and a single point of failure for every request in the system.


## 4. Prove Application Behavior

Verify individual endpoints, Prometheus metrics, and the end-to-end booking flow.

### Check Health, Readiness, and Metrics

```bash
# Liveness probe (process is running)
curl -i http://localhost:8081/healthz

# Readiness probe (DB connection is active)
curl -i http://localhost:8081/readyz

# Flight inventory query
curl -s http://localhost:8081/api/flights | jq '.flights | length'
# Returns: 186 flights across 31 days

# Prometheus text metrics
curl -s http://localhost:8081/metrics | head -n 15
```

### Execute the Flagship Booking Workflow

Authenticate with the seeded passenger credentials, extract the JWT, and book flight `AA101`:

```bash
# 1. Authenticate with Identity service
TOKEN=$(curl -s -X POST http://localhost:8080/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"passenger@apolloairlines.com","password":"pass123"}' \
  | jq -r .token)

echo "JWT Token: ${TOKEN:0:30}..."

# 2. Create a booking with correlated X-Request-ID
curl -s -X POST http://localhost:8082/api/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: launchpad-demo-001' \
  -d '{"flightId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}' | jq
```

Expected response:
```json
{
  "booking": {
    "id": "...",
    "userId": "11111111-1111-1111-1111-111111111111",
    "flightId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "status": "CONFIRMED",
    "seat": "14B"
  }
}
```

Follow the logs across all services to see the request propagation:

```bash
docker compose logs --tail=20 booking identity flight notification
```

Notice how `X-Request-ID: launchpad-demo-001` is forwarded from `booking` to `flight`, `identity`, and queued into `notification` via `redis`.

### Access the Web UI

Open your browser to [http://localhost:3000](http://localhost:3000):
- Log in as `passenger@apolloairlines.com` / `pass123`.
- Search for flights from `BOM` (Mumbai) to `DEL` (Delhi).
- Click **Book Now** and view your confirmed reservation.

---

## 5. Break Readiness, Then Recover

Kubernetes relies heavily on distinguishing between **liveness** (should we restart the container?) and **readiness** (should we route user traffic to it?). Let's test this behavior.

### The Break Experiment

Deliberately stop `flight-db` while keeping the `flight` service container running:

```bash
docker compose stop flight-db
```

Now test both probes on the `flight` service:

```bash
# Process is still alive -> returns 200 OK
curl -i http://localhost:8081/healthz

# Database is unreachable -> returns 503 Service Unavailable
curl -i http://localhost:8081/readyz
```

Observe how the failure cascades to dependent services:

```bash
# Search service depends on Flight -> returns 503
curl -i http://localhost:8083/readyz

# Booking service depends on Flight and Flight-DB -> returns 503
curl -i http://localhost:8082/readyz
```

Inspect the container logs to observe connection retries:

```bash
docker compose logs --tail=40 flight
```

### The Recovery Experiment

Restart `flight-db` and observe automatic recovery:

```bash
docker compose start flight-db

# Retry until readyz returns 200 OK
curl -i --retry 15 --retry-delay 2 --retry-all-errors http://localhost:8081/readyz
```

Once `flight` recovers, check `search` and `booking`:

```bash
curl -i http://localhost:8083/readyz
curl -i http://localhost:8082/readyz
```

Both return `200 OK`. The system recovered cleanly without restarting the application processes.

---

## 6. Prove Database Persistence

Containers are disposable, but application data must not be lost. Let's prove that Docker named volumes preserve state across container destruction.

```bash
# 1. Count users currently stored in identity-db
docker compose exec identity-db \
  sh -c 'psql -U "$POSTGRES_USER" -d identity -c "SELECT count(*) FROM users;"'
# Output: 2

# 2. Stop and delete the identity-db container completely
docker compose stop identity-db
docker compose rm -f identity-db

# 3. Start a brand new identity-db container
docker compose up -d --wait identity-db

# 4. Re-query the database
docker compose exec identity-db \
  sh -c 'psql -U "$POSTGRES_USER" -d identity -c "SELECT count(*) FROM users;"'
# Output: 2 (Data is intact!)
```

The data survived because the named volume `identity-db-data` was retained on the Docker host and re-attached to the new container.

---

## 7. Deep Dive: Dockerfile Patterns

### Multi-Stage Build: Go Services

All Go services (`flight`, `booking`, `search`, `notification`) use an identical two-stage pattern:

```dockerfile
# Stage 1: Build Environment (~800MB)
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/service .

# Stage 2: Production Runtime (~15MB)
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
RUN adduser -D -u 10001 -g appuser appuser
WORKDIR /app
COPY --from=builder /app/service /app/service
USER 10001:10001
EXPOSE 8081
ENTRYPOINT ["/app/service"]
```

**Why this matters:**
- `CGO_ENABLED=0` generates a statically linked binary with zero external libc dependencies.
- Build tools, Go compiler, and source files are discarded; the runtime image contains only the compiled binary and root certificates.
- Runs under UID `10001` (`appuser`) rather than root.

### Multi-Stage Build: Frontend (React SPA + NGINX)

```dockerfile
# Stage 1: Node.js build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_IDENTITY_URL
ARG VITE_FLIGHT_URL
ARG VITE_BOOKING_URL
ARG VITE_SEARCH_URL
ENV VITE_IDENTITY_URL=$VITE_IDENTITY_URL \
    VITE_FLIGHT_URL=$VITE_FLIGHT_URL \
    VITE_BOOKING_URL=$VITE_BOOKING_URL \
    VITE_SEARCH_URL=$VITE_SEARCH_URL
RUN npm run build

# Stage 2: Minimal NGINX Server
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

**Why this matters:**
- Build arguments (`ARG VITE_*`) are baked into the compiled JavaScript bundle at build time.
- `nginx.conf` configures `try_files $uri $uri/ /index.html;` so React Router can handle client-side routing.

---

## Maintainer Verification

Run the automated verification test script to audit your environment:

```bash
cd stages/launchpad
./scripts/verify.sh
```

The script runs **73 automated checks**, verifying:
1. Docker Compose profile isolation (Dozzle is off by default).
2. All 10 application containers report `healthy`.
3. Non-root user compliance across all containers.
4. Read-only filesystem enforcement.
5. Functional `/healthz`, `/readyz`, and `/metrics` endpoints.
6. Successful user login, flight query, and end-to-end booking execution.

---

## Clean Up

### Option A: Stop Containers, Keep Data
Preserves database volumes for your next session:
```bash
docker compose down
```

### Option B: Complete Teardown (Fresh Start)
Stops containers **and destroys all named database volumes**:
```bash
docker compose down --volumes
```

---

## Explain & Review Questions

Before proceeding to Ignition, ensure you can answer:

1. **Why do containers communicate using `http://flight:8081` rather than `http://localhost:8081`?**
   Docker assigns each container its own network namespace and IP on the bridge network. `localhost` refers only to the container itself; the embedded Docker DNS server resolves service names to container IPs.

2. **What is the critical distinction between `/healthz` and `/readyz`?**
   `/healthz` tests process liveness (is the web server thread responsive?). `/readyz` tests operational dependencies (can the service connect to PostgreSQL/Redis?).

3. **Why did database records survive when `identity-db` was destroyed with `docker compose rm`?**
   The PostgreSQL data directory was mounted to a named Docker volume (`identity-db-data`), which resides on the host and decouples data lifecycle from container lifecycle.

4. **Why are application containers configured with read-only root filesystems?**
   To prevent attackers from downloading binaries, modifying application code, or writing web shells if a vulnerability is exploited at runtime.

---

## What's Next

In [Ignition](./ignition.md), we transition from Docker Compose to Kubernetes. You will create a multi-node **kind** cluster, explore cluster internals, launch your first Pod, and learn the Kubernetes troubleshooting evidence ladder.