:::info
    This is where it all begins!

    - Apollo11 is a **library management system** — 6 microservices that give us realistic patterns to work with: databases, queues, API-to-API calls, background jobs, and a frontend.
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
| **frontend** | Go + Gin | 3000 | — |
| **auth** | Python + FastAPI | 8080 | PostgreSQL 15 |
| **catalog** | Go + Gin | 8081 | PostgreSQL 15 + Redis 7 |
| **circulation** | Go + Gin | 8082 | PostgreSQL 15 |
| **notification** | Go + Gin | 8083 | Redis 7 (port 6380) |
| **fines** | Go + Gin | 8084 | SQLite on volume |

> **Infrastructure:** auth-postgres, catalog-postgres, circulation-postgres (PostgreSQL 15) + catalog-redis, notification-redis (Redis 7)

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

This builds all 6 app images and starts all 11 containers (6 apps + 5 infra).

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
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health
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
┌─────────────────────────────────────────────────────┐
│                   apollo-network (bridge)           │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ frontend │  │   auth   │  │  catalog-postgres │ │
│  │  :3000   │──│  :8080   │──│      :5432        │ │
│  └──────────┘  └────┬─────┘  └──────────────────┘ │
│                     │                               │
│  ┌──────────┐  ┌────┴─────┐  ┌──────────────────┐ │
│  │ catalog  │  │catalog- │  │ catalog-redis    │ │
│  │  :8081   │──│  redis   │  │     :6379        │ │
│  └────┬─────┘  └──────────┘  └──────────────────┘ │
│       │                                            │
│  ┌────┴──────┐  ┌──────────────────┐  ┌────────┐ │
│  │circulation │  │circulation-postgr│  │  fines │ │
│  │   :8082   │──│       :5432      │  │ :8084  │ │
│  └────┬──────┘  └──────────────────┘  └────────┘ │
│       │                                        │
│  ┌────┴─────┐  ┌──────────────────┐            │
│  │notificati│  │notification-redis│            │
│  │  on:8083 │──│     :6380        │            │
│  └──────────┘  └──────────────────┘            │
└──────────────────────────────────────────────────┘
```

Service discovery: use the service name as hostname (e.g., `auth:8080`, `catalog-postgres:5432`).

---

## All 11 Services

| Service | Image | Port | Depends On | Purpose |
|---|---|---|---|---|
| frontend | Go/Gin | 3000 | auth, catalog, circulation | Web UI + health dashboard |
| auth | Python/FastAPI | 8080 | auth-postgres | JWT authentication |
| catalog | Go/Gin | 8081 | catalog-postgres, catalog-redis | Book/author management |
| circulation | Go/Gin | 8082 | circulation-postgres | Loans, reservations |
| notification | Go/Gin | 8083 | notification-redis | Email notifications |
| fines | Go/Gin | 8084 | — | Fine calculations (SQLite) |
| auth-postgres | postgres:15-alpine | 5432 | — | Auth database |
| catalog-postgres | postgres:15-alpine | 5432 | — | Catalog database |
| catalog-redis | redis:7-alpine | 6379 | — | Cache + sessions |
| circulation-postgres | postgres:15-alpine | 5432 | — | Circulation database |
| notification-redis | redis:7-alpine | 6380 | — | Notification queue |

---

## Key Files

```
stages/launchpad/
├── docker-compose.yml          # All 11 services, networking, volumes
├── code/
│   ├── frontend/
│   │   ├── main.go             # Gin HTTP server, serves HTML UI
│   │   ├── Dockerfile           # Go binary → scratch
│   │   └── nginx.conf          # (if using nginx sidecar)
│   ├── auth/
│   │   ├── main.py             # FastAPI app, JWT stubs, CORS middleware
│   │   ├── requirements.txt     # fastapi, uvicorn, pydantic
│   │   ├── Dockerfile           # python:3.11-slim multi-stage
│   │   └── init.sql             # DB schema (auto-run on first start)
│   ├── catalog/
│   │   ├── main.go             # Books/authors CRUD, CORS middleware
│   │   ├── go.mod / go.sum      # Dependencies
│   │   ├── Dockerfile           # Go → scratch multi-stage
│   │   └── init.sql             # DB schema
│   ├── circulation/
│   │   ├── main.go             # Loans/reservations CRUD, CORS middleware
│   │   ├── go.mod / go.sum
│   │   ├── Dockerfile
│   │   └── init.sql
│   ├── notification/
│   │   ├── main.go             # Notification queue, CORS middleware
│   │   ├── go.mod / go.sum
│   │   └── Dockerfile
│   └── fines/
│       ├── main.go             # Fine calc with SQLite, CORS middleware
│       ├── go.mod / go.sum
│       └── Dockerfile
```

---

## Database Initialization

Each PostgreSQL service mounts its `init.sql` into `/docker-entrypoint-initdb.d/` — Postgres runs it automatically on first container start (only if the DB is empty):

```yaml
auth:
  volumes:
    - type: bind
      source: ./code/auth/init.sql
      target: /docker-entrypoint-initdb.d/init.sql
```

Redis has no init script — it starts empty and serves as a cache/queue.

---

## Health Checks

Every app exposes `GET /health` returning `{"status":"ok"}`.

Database containers use native health checks:

```yaml
auth-postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d auth"]
    interval: 5s
    timeout: 5s
    retries: 10

catalog-redis:
  healthcheck:
    test: ["CMD-SHELL", "redis-cli ping"]
    interval: 5s
    timeout: 5s
    retries: 10
```

Apps wait for their DB to be healthy before starting:

```yaml
auth:
  depends_on:
    auth-postgres:
      condition: service_healthy   # NOT service_started
```

---

## Volume Management

Named Docker volumes persist data across restarts:

```yaml
volumes:
  auth-postgres-data:      # Survives `docker compose down`
  catalog-postgres-data:
  circulation-postgres-data:
  fines-data:
```

```
# See volume contents
docker volume inspect launchpad_auth-postgres-data

# Reset everything (remove volumes)
docker compose down -v

# Restart keeping volumes
docker compose down
docker compose up -d
```

> **Fines service:** SQLite file at `/data/fines.db` — data survives restarts via the `fines-data` volume.

---

## Common Tasks

### View logs for a specific service

```bash
docker compose logs -f auth
docker compose logs --tail=50 circulation
```

### Restart a single service (no rebuild)

```bash
docker compose restart catalog
```

### Rebuild a single service after code change

```bash
docker compose up -d --build catalog
```

### Shell into a running container

```bash
docker compose exec -it auth-postgres psql -U postgres -d auth
docker compose exec -it catalog-redis redis-cli
```

### Test service-to-service communication (from inside a container)

```bash
docker compose exec catalog curl -s http://auth:8080/health
```

### Full rebuild

```bash
docker compose down -v
docker compose up -d --build
```

---

## Troubleshooting

### `COPY failed: file not found in build context`

A service is missing `go.sum` (Go) or `requirements.txt` (Python). Run:

```bash
# Go services — generate go.sum
cd code/catalog && go mod tidy
cd code/circulation && go mod tidy
cd code/fines && go mod tidy
cd code/frontend && go mod tidy
cd code/notification && go mod tidy
```

Then rebuild.

### Services show DOWN in browser but curl works

**CORS issue** — the browser's JavaScript makes cross-origin requests. All Go services need CORS middleware added to `main.go`:

```go
func cors() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }
        c.Next()
    }
}

func main() {
    r := gin.Default()
    r.Use(cors())
    // ...
}
```

For auth (FastAPI), add:
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

### Container exits immediately

Check logs:
```bash
docker compose logs fines
docker compose logs catalog
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

### 1. Go Services (catalog, circulation, notification, fines)

Multi-stage build: compile in Go container, run from `scratch` (no OS):

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/catalog .

FROM scratch
COPY --from=builder /bin/catalog /bin/catalog
EXPOSE 8081
ENTRYPOINT ["/bin/catalog"]
```

### 2. Python Service (auth)

Standard Python + FastAPI with multi-stage build:

```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /src
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

FROM python:3.11-slim
WORKDIR /src
COPY --from=builder /src/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=builder /src/ .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 3. Frontend (Go)

Single-stage: Go binary on scratch, serves HTML directly:

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/frontend .

FROM scratch
COPY --from=builder /bin/frontend /bin/frontend
EXPOSE 3000
ENTRYPOINT ["/bin/frontend"]
```

---

## Key Takeaways

```
Docker:       Containers are isolated, reproducible environments
Compose:      Orchestrate multi-container local development
Multi-stage:  Build in heavy container, run from minimal image (scratch)
Health:       Every service exposes /health; DBs use pg_isready/redis-cli ping
DNS:          Service names resolve to container IPs automatically (auth:8080)
Volumes:      Named volumes persist data across restarts
CORS:         Browser JS needs Access-Control headers to call other services
Init scripts: PostgreSQL auto-runs .sql files in /docker-entrypoint-initdb.d/
Condition:    Apps depend on service_healthy, not just service_started
```

---

## What's Next

[Ignition](./ignition.md) — spin up a kind cluster and run your first Pod in Kubernetes.