:::info
    This is where it all begins!

    - Apollo11 is an **airline management system** — 6 microservices that give us realistic patterns to work with: databases, queues, API-to-API calls, background jobs, and a frontend.
    - We use this system to explore the entire cloud-native stack: networking, storage, observability, scaling, security, GitOps, and cloud provisioning.
    - No hello-world apps here — real services with real databases let us explore things that trivial examples can't.
:::

## Prerequisites

This guide assumes you already know:

- **What Docker is** — containers package code + dependencies into an isolated, portable unit
- **How images and containers differ** — an image is a read-only template; a container is a running instance
- **Basic Docker commands** — `docker run`, `docker ps`, `docker logs`, `docker exec`
- **What a registry is** — Docker Hub holds pre-built images you `pull`
- **How environment variables work** in containers
- **Host networking basics** — ports map from container to host (`localhost:8080`)

If any of those are fuzzy, spend 30 minutes with the [Docker getting started docs](https://docs.docker.com/get-started/) before continuing.

## A Quick Refresher

```
Image       → Read-only blueprint (postgres:15-alpine, redis:7-alpine)
Container   → Running instance of an image
Registry    → Remote store of images (Docker Hub)
Volume      → Persistent storage that survives container restarts
Network     → Docker's internal bridge lets containers talk by name
Port        → Maps container port to host port (host:container)
```

```
# Pull an image
docker pull postgres:15-alpine

# Run a container (creates it + starts it)
docker run -d --name my-db -p 5432:5432 postgres:15-alpine

# See running containers
docker ps

# Logs
docker logs my-db

# Shell into running container
docker exec -it my-db sh

# Stop + remove
docker stop my-db && docker rm my-db
```

## Components

The architecture consists of 6 services plus infrastructure:

| Component | Technology | Port | Database |
| :--- | :--- | :--- | :--- |
| **frontend** | React/Node | 3000 | — |
| **identity** | Python + FastAPI | 8080 | PostgreSQL 15 |
| **flight** | Go + Gin | 8081 | PostgreSQL 15 |
| **booking** | Go + Gin | 8082 | PostgreSQL 15 |
| **search** | Go + Gin | 8083 | — |
| **notification** | Go + Gin | 8084 | — |

> **Infrastructure:** identity-db, flight-db, booking-db (PostgreSQL 15) + redis (Redis 7)

---

## Step-by-Step Setup

### 1. Clone and navigate

```bash
git clone https://github.com/darshan-raul/Apollo11.git
cd Apollo11/stages/launchpad
```

### 2. Build and start all services

```bash
docker compose up -d --build
```

This builds all 6 app images and starts all 10 containers (6 apps + 4 infra).

### 3. Wait for databases to initialize

PostgreSQL containers need ~10s to start and run init scripts. Health checks ensure apps don't start until their DB is ready:

```
# Check container status
docker compose ps

# Watch logs as services start
docker compose logs -f
```

### 4. Verify all services are up

```bash
# Check individual health endpoints
for port in 3000 8080 8081 8082 8083 8084; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/healthz
  echo
done
```

Expected output: all return `200`.

### 5. Open the web UI

```
http://localhost:3000
```

Click **"Check All Services"** — all 6 should show `ok`.

---

## Network Architecture

```
┌──────────────────────────────────────────────────────┐
│                   apollo-network (bridge)            │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ frontend │  │ identity │  │    identity-db     │  │
│  │   :3000  │──│  :8080   │──│       :5432        │  │
│  └──────────┘  └────┬─────┘  └────────────────────┘  │
│                     │                                  │
│  ┌──────────┐  ┌────┴─────┐  ┌────────────────────┐  │
│  │  flight  │  │ flight-db│  │       redis        │  │
│  │  :8081   │──│   :5432  │  │       :6379        │  │
│  └────┬─────┘  └──────────┘  └────────────────────┘  │
│       │                                               │
│  ┌────┴──────┐  ┌────────────────────┐  ┌─────────┐  │
│  │  booking  │  │    booking-db      │  │  search │  │
│  │   :8082   │──│        :5432       │──│  :8083  │  │
│  └───────────┘  └────────────────────┘  └─────────┘  │
│       │                                               │
│  ┌────┴─────┐  ┌────────────────────┐               │
│  │notificati│  │     notification    │               │
│  │  on:8084 │──│      (no DB)        │               │
│  └──────────┘  └────────────────────┘               │
└──────────────────────────────────────────────────────┘
```

Service discovery: use the service name as hostname (e.g., `identity:8080`, `identity-db:5432`).

---

## All 10 Services

| Service | Image | Port | Depends On | Purpose |
|---|---|---|---|---|
| frontend | React/Node | 3000 | identity, flight, booking | Web UI + health dashboard |
| identity | Python/FastAPI | 8080 | identity-db | JWT authentication, passenger management |
| flight | Go/Gin | 8081 | flight-db | Flight inventory, seat management |
| booking | Go/Gin | 8082 | booking-db | Reservations, the flagship workflow |
| search | Go/Gin | 8083 | — | Optimised flight search (Redis from Stage 7) |
| notification | Go/Gin | 8084 | — | Event fan-out |
| identity-db | postgres:15-alpine | 5432 | — | Identity database |
| flight-db | postgres:15-alpine | 5432 | — | Flight database |
| booking-db | postgres:15-alpine | 5432 | — | Booking database |
| redis | redis:7-alpine | 6379 | — | Cache + queue |

---

## Key Files

```
stages/launchpad/
├── docker-compose.yml          # All 10 services, networking, volumes
├── code/
│   ├── frontend/
│   │   ├── package.json         # Node/React app
│   │   ├── Dockerfile           # node:20-alpine build → nginx:alpine serve
│   │   └── nginx.conf           # Static file serving
│   ├── identity/
│   │   ├── main.py              # FastAPI app, JWT stubs, CORS middleware
│   │   ├── requirements.txt     # fastapi, uvicorn, pydantic, psycopg2
│   │   ├── Dockerfile           # python:3.12-slim multi-stage
│   │   └── init.sql             # DB schema (auto-run on first start)
│   ├── flight/
│   │   ├── main.go              # Flights, airports, seat management, CORS middleware
│   │   ├── go.mod / go.sum      # Dependencies
│   │   ├── Dockerfile           # Go → scratch multi-stage
│   │   └── init.sql             # DB schema
│   ├── booking/
│   │   ├── main.go              # Reservations CRUD, CORS middleware
│   │   ├── go.mod / go.sum
│   │   ├── Dockerfile
│   │   └── init.sql
│   ├── search/
│   │   ├── main.go              # Flight search, CORS middleware
│   │   ├── go.mod / go.sum
│   │   └── Dockerfile
│   └── notification/
│       ├── main.go             # Notification fan-out, CORS middleware
│       ├── go.mod / go.sum
│       └── Dockerfile
```

---

## Database Initialization

Each PostgreSQL service mounts its `init.sql` into `/docker-entrypoint-initdb.d/` — Postgres runs it automatically on first container start (only if the DB is empty):

```yaml
identity:
  volumes:
    - type: bind
      source: ./code/identity/init.sql
      target: /docker-entrypoint-initdb.d/init.sql
```

Redis has no init script — it starts empty and serves as a cache.

---

## Health Checks

Every app exposes `GET /healthz` and `GET /readyz`. Database containers use native health checks:

```yaml
identity-db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d identity"]
    interval: 5s
    timeout: 5s
    retries: 10

redis:
  healthcheck:
    test: ["CMD-SHELL", "redis-cli ping"]
    interval: 5s
    timeout: 5s
    retries: 10
```

Apps wait for their DB to be healthy before starting:

```yaml
identity:
  depends_on:
    identity-db:
      condition: service_healthy   # NOT service_started
```

---

## Volume Management

Named Docker volumes persist data across restarts:

```yaml
volumes:
  identity-db-data:      # Survives `docker compose down`
  flight-db-data:
  booking-db-data:
```

```
# See volume contents
docker volume inspect launchpad_identity-db-data

# Reset everything (remove volumes)
docker compose down -v

# Restart keeping volumes
docker compose down
docker compose up -d
```

---

## Common Tasks

### View logs for a specific service

```bash
docker compose logs -f identity
docker compose logs --tail=50 booking
```

### Restart a single service (no rebuild)

```bash
docker compose restart flight
```

### Rebuild a single service after code change

```bash
docker compose up -d --build flight
```

### Shell into a running container

```bash
docker compose exec -it identity-db psql -U postgres -d identity
docker compose exec -it redis redis-cli
```

### Test service-to-service communication (from inside a container)

```bash
docker compose exec flight curl -s http://identity:8080/healthz
```

### Full rebuild

```bash
docker compose down -v
docker compose up -d --build
```

---

## Troubleshooting

### `COPY failed: file not found in build context`

A Go service is missing `go.sum` or a Python service is missing `requirements.txt`. Run:

```bash
# Go services — generate go.sum
cd code/flight && go mod tidy
cd code/booking && go mod tidy
cd code/search && go mod tidy
cd code/notification && go mod tidy
```

Then rebuild.

### Services show DOWN in browser but curl works

**CORS issue** — the browser's JavaScript makes cross-origin requests. All Go services have CORS middleware by default.

### Container exits immediately

Check logs:
```bash
docker compose logs search
docker compose logs flight
```

### Port already in use

Another process is using one of the ports (3000, 8080-8084):

```bash
lsof -i :3000
kill $(lsof -t -i :8080)
```

---

## Clean Up

```bash
# Stop and remove containers (keeps volumes)
docker compose down

# Stop and remove containers + volumes (full reset)
docker compose down -v

# Remove images (next up will rebuild)
docker compose down --rmi local
```

---

## Dockerfile Patterns Used

### 1. Go Services (flight, booking, search, notification)

Multi-stage build: compile in Go container, run from `scratch` (no OS):

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/flight .

FROM scratch
COPY --from=builder /bin/flight /bin/flight
EXPOSE 8081
ENTRYPOINT ["/bin/flight"]
```

### 2. Python Service (identity)

Standard Python + FastAPI with multi-stage build:

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /src
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

FROM python:3.12-slim
WORKDIR /src
COPY --from=builder /src/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=builder /src/ .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 3. Frontend (React SPA)

Multi-stage: Node builds the React app, NGINX serves static files:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /src/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

---

## Key Takeaways

```
Docker:       Containers are isolated, reproducible environments
Compose:      Orchestrate multi-container local development
Multi-stage:  Build in heavy container, run from minimal image (scratch/nginx)
Health:       Every service exposes /healthz and /readyz; DBs use pg_isready/redis-cli ping
DNS:          Service names resolve to container IPs automatically (identity:8080)
Volumes:      Named volumes persist data across restarts
CORS:         Browser JS needs Access-Control headers to call other services
Init scripts: PostgreSQL auto-runs .sql files in /docker-entrypoint-initdb.d/
Condition:    Apps depend on service_healthy, not just service_started
```

---

## What's Next

[Ignition](./ignition.md) — spin up a kind cluster and run your first Pod in Kubernetes.