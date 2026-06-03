!!! note
    This is where it all begins!

    - Apollo11 is a **library management system** — 6 microservices that give us realistic patterns to work with: databases, queues, API-to-API calls, background jobs, and a frontend.
    - We use this system to explore the entire cloud-native stack: networking, storage, observability, scaling, security, GitOps, and cloud provisioning.
    - No hello-world apps here — real services with real databases let us explore things that trivial examples can't.

## Components

The architecture consists of 6 services plus infrastructure:

| Component | Technology | Port | Database |
| :--- | :--- | :--- | :--- |
| **frontend** | Go + Gin + Nginx | 3000 | — |
| **auth** | Python + FastAPI | 8080 | PostgreSQL 15 |
| **catalog** | Go + Gin | 8081 | PostgreSQL 15 + Redis 7 |
| **circulation** | Go + Gin | 8082 | PostgreSQL 15 |
| **notification** | Go + Gin | 8083 | Redis 7 (port 6380) |
| **fines** | Go + Gin | 8084 | SQLite on PVC |

> **Infrastructure:** auth-postgres, catalog-postgres, circulation-postgres (PostgreSQL 15) + catalog-redis, notification-redis (Redis 7)

---

## Running locally with Docker Compose

> You don't need to install Python, Go, or Node — everything runs in containers.

### Prereqs

Install `docker` and `docker compose`:

```bash
git clone https://github.com/darshan-raul/Apollo11.git
cd Apollo11/stages/launchpad
docker compose up --build
```

### Check services

7 containers should be running:

```bash
docker ps
```

```
CONTAINER ID   IMAGE                   PORTS
apollo11-auth        → :8080
apollo11-catalog     → :8081
apollo11-circulation → :8082
apollo11-notification → :8083
apollo11-fines       → :8084
apollo11-frontend    → :3000
apollo11-auth-postgres    → :5432
```

All services expose a `/health` endpoint for basic liveness checks.

---

## Dockerfile Patterns Used

### 1. Go Services (catalog, circulation, notification, fines)

Multi-stage build: compile in Go container, run from `scratch` (no OS):

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o service

FROM scratch
COPY --from=builder /app/service /service
EXPOSE 8081
CMD ["/service"]
```

### 2. Python Service (auth)

Standard Python + FastAPI:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 3. Frontend (Go + Nginx sidecar)

Go serves the API, Nginx serves static files:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o frontend

FROM nginx:alpine
COPY --from=builder /app/frontend /usr/local/bin/frontend
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

---

## Docker Compose Layout

```
stages/launchpad/
├── docker-compose.yml
└── code/
    ├── auth/          (Python/FastAPI + PostgreSQL)
    ├── catalog/       (Go + PostgreSQL + Redis)
    ├── circulation/   (Go + PostgreSQL)
    ├── notification/  (Go + Redis)
    ├── fines/         (Go + SQLite)
    └── frontend/      (Go + Nginx)
```

Each service directory has its own `Dockerfile` and application code.

### Key compose patterns

**Service-to-service communication** (uses Docker DNS):
```yaml
auth:
  environment:
    DATABASE_URL: postgresql://postgres:***@auth-postgres:5432/auth
catalog:
  environment:
    DATABASE_URL: postgresql://postgres:***@catalog-postgres:5432/catalog
    REDIS_URL: redis://catalog-redis:6379
```

**Health checks** (database must be ready before app starts):
```yaml
auth-postgres:
  image: postgres:15-alpine
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d auth"]
    interval: 5s
    timeout: 5s
    retries: 10
  depends_on:
    auth-postgres:
      condition: service_healthy
```

---

## Key Takeaways

```
Docker:     Containers are isolated, reproducible environments
Compose:    Orchestrate multi-container local development
Multi-stage: Build in heavy container, run from minimal image (scratch)
Health:     Every service exposes /health; DBs use pg_isready/redis-cli ping
DNS:        Service names resolve to container IPs automatically
Volumes:    Named volumes persist data across restarts
```

---

## What's Next

[Ignition](./ignition.md) — spin up a kind cluster and run your first Pod in Kubernetes.