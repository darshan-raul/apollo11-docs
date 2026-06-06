---
title: "Launchpad — Docker Compose"
description: "Get Apollo Airlines running locally with Docker Compose. 10 components, stub code, seed data ready."
---

## Prerequisites

### 1. Install Devbox

This project uses **Devbox** to manage all toolchain dependencies. This gives you `docker`, `kind`,`kubectl`, `helm` and all other tools without installing them manually.

> **What is Devbox?** Devbox is a tool that creates reproducible, isolated development environments. It manages your tools (docker, kubectl, kind, etc.) through a simple JSON file — no more hunting for installation instructions for each tool.

```bash
# Install Devbox
curl -fsSL https://get.jetify.com/devbox | bash

# Enter the Devbox environment (loads all tools)
devbox shell

```
You should see output like below:

![alt text](image-3.png)

try to check if docker is installed and you are using the devbox version:

```bash
# check docker version
docker --version

# check the location of docker binary should be in .devbox/ path in your repo
which docker
```


### 2. Docker Basics

This guide assumes you already know these docker basics:

- **What Docker is** — containers package code + dependencies into an isolated, portable unit
- **How images and containers differ** — an image is a read-only template; a container is a running instance
- **Basic Docker commands** — `docker run`, `docker ps`, `docker logs`, `docker exec`
- **What a registry is** — Docker Hub holds pre-built images you `pull`
- **How environment variables work** in containers
- **Host networking basics** — ports map from container to host (`localhost:8080`)
- **How docker compose works** 

:::tip
If any of those are fuzzy, please revisit these: https://docs.docker.com/engine/

Want to do deeper? I got just the right guide for you: https://containers.darshanraul.me 

Here you will be able to go from sctrach to literally creating you own container in bash within 5 stages
:::

## What You'll Learn

- Multi-stage Dockerfile builds 
- Multi-container Docker Compose setup
- PostgreSQL initialization via `/docker-entrypoint-initdb.d/`
- Volume management for stateful services


**Goal:** Run all 10 components locally using Docker Compose.


## Architecture

```mermaid
graph TB
    subgraph Frontend
        F([frontend:3000])
    end

    subgraph Services
        ID([identity:8080])
        FL([flight:8081])
        BK([booking:8082])
        SN([search:8083])
        NT([notification:8084])
    end

    subgraph Databases
        IDDB[("identity-db<br/>postgres:15<br/>:5432")]
        FLDB[("flight-db<br/>postgres:15<br/>:5432")]
        BKDB[("booking-db<br/>postgres:15<br/>:5432")]
        RD[(redis<br/>redis:7<br/>:6379)]
    end

    subgraph Observability
        DZ([dozzle:8085])
    end

    F --> ID
    F --> FL
    F --> BK
    F --> SN

    BK --> FL
    BK --> ID
    BK --> NT

    SN --> FL

    NT --> RD

    ID --> IDDB
    FL --> FLDB
    BK --> BKDB

```

### Services (11 total)

| Service | Language | Port | Database | Purpose |
|---|---|---|---|---|
| frontend | React/Node | 3000 | — | SPA, served via NGINX |
| identity | Python/FastAPI | 8080 | identity-db | JWT auth, user profiles |
| flight | Go/Gin | 8081 | flight-db | Flight inventory, seat management |
| booking | Go/Gin | 8082 | booking-db | Reservations (flagship) |
| search | Go/Gin | 8083 | — | Flight search (no cache yet) |
| notification | Go/Gin | 8084 | — | Event fan-out |
| identity-db | PostgreSQL 15 | 5432 | — | users table |
| flight-db | PostgreSQL 15 | 5432 | — | airports + flights tables |
| booking-db | PostgreSQL 15 | 5432 | — | bookings table |
| redis | Redis 7 | 6379 | — | Notification queue |
| dozzle | Node/Go | 8085 | — | Real-time container log viewer |

## Key Files

```
stages/launchpad/
├── docker-compose.yml          # All 10 services
├── README.md                   # This file
└── code/
    ├── identity/               # Python/FastAPI — users, JWT
    │   ├── main.py
    │   ├── requirements.txt
    │   ├── Dockerfile
    │   └── init.sql            # users table + seed data
    ├── flight/                  # Go/Gin — flights, seats
    │   ├── main.go
    │   ├── go.mod
    │   ├── Dockerfile
    │   └── init.sql            # airports + flights tables + seed
    ├── booking/                 # Go/Gin — reservations
    │   ├── main.go
    │   ├── go.mod
    │   ├── Dockerfile
    │   └── init.sql            # bookings table
    ├── search/                  # Go/Gin — flight search (stateless)
    │   ├── main.go
    │   ├── go.mod
    │   └── Dockerfile
    ├── notification/            # Go/Gin — event fan-out
    │   ├── main.go
    │   ├── go.mod
    │   └── Dockerfile
    └── frontend/                # React SPA
        ├── src/
        ├── Dockerfile          # Multi-stage: node builds → nginx serves
        └── nginx.conf
```


**Users:**
- `admin@apolloairlines.com` / `admin123` (ADMIN)
- `passenger@apolloairlines.com` / `pass123` (PASSENGER)

## Docker Images Used

| Service | Image |
|---|---|
| Go services | `golang:1.22-alpine` |
| Python service | `python:3.12-slim` |
| Frontend build | `node:20-alpine` |
| Frontend serve | `nginx:alpine` |
| PostgreSQL | `postgres:15-alpine` |
| Redis | `redis:7-alpine` |

## Run It

```bash
cd stages/launchpad
docker compose up --build
```

![alt text](image-1.png)

> Wait ~2min before verifying. We will understand why in detailed notes below

In your browser, go to "http://localhost:3000"


<figure>
  <img src="/img/image-2.png" alt="description" />
  <figcaption>You should see something like this</figcaption>
</figure>



**Users:**
- `admin@apolloairlines.com` / `admin123` (ADMIN)
- `passenger@apolloairlines.com` / `pass123` (PASSENGER)


## Ports Summary

| Service | Port | Access |
|---|---|---|
| frontend | 3000 | http://localhost:3000 |
| identity | 8080 | http://localhost:8080 |
| flight | 8081 | http://localhost:8081 |
| booking | 8082 | http://localhost:8082 |
| search | 8083 | http://localhost:8083 |
| notification | 8084 | http://localhost:8084 |
| dozzle | 8085 | http://localhost:8085 |

## Clean Up

```bash
docker compose down -v   # -v removes volumes (data reset)
docker compose down       # keep volumes
```


## Docker Compose Explained

The `docker-compose.yml` orchestrates all 11 services. Here's how each piece works:

### Service definition anatomy

```yaml
identity:                    # Service name — also the hostname on the network
  image: postgres:15-alpine  # Pre-built image (no build needed)
  healthcheck:               # Docker waits for DB to be ready before starting dependents
    test: ["CMD-SHELL", "pg_isready -U postgres -d identity"]
    interval: 5s
    timeout: 5s
    retries: 10
  environment:               # Injected as env vars inside the container
    - POSTGRES_USER=postgres
    - POSTGRES_PASSWORD=postgres
    - POSTGRES_DB=identity
  volumes:
    - type: volume           # Named volume — persists data across restarts
      source: identity-db-data
      target: /var/lib/postgresql/data
    - type: bind             # Bind mount — syncs a host file/folder into the container
      source: ./code/identity/init.sql
      target: /docker-entrypoint-initdb.d/init.sql   # ← runs ONCE on first start
  depends_on:
    identity-db:
      condition: service_healthy  # Wait for healthcheck, not just container start
  networks:
    - apollo-airlines        # All services share this bridge network
```

### How init.sql works

PostgreSQL's official image runs any `.sql` file in `/docker-entrypoint-initdb.d/` **once** — the first time the database is initialized. It doesn't re-run on subsequent starts, which is why data persists across `docker compose down && up`.

The order matters: `identity-db` has an init script, and `identity` has `depends_on: condition: service_healthy`, so it waits for the DB to pass `pg_isready` before starting. Without `service_healthy`, the app could start before the DB is ready and fail to connect.

### Go services: `command` override

```yaml
command: sh -c 'DATABASE_URL="postgresql://postgres:***@flight-db:5432/flight" /app/flight-service'
```

The Go binaries are compiled with `ENV DATABASE_URL` set to `***` as a placeholder at build time. The `command` override injects the real connection string at runtime. This keeps secrets out of the image — the compiled binary never contains real credentials.

### Redis and Dozzle don't get healthchecks

Redis uses `redis-cli ping` as its healthcheck. Dozzle is a read-only log viewer — it doesn't need a healthcheck because it has no dependency on other services being healthy to function.

### Volumes vs Bind Mounts

| Type | What it does | Use case |
|---|---|---|
| `type: volume` | Docker-managed persistent storage | Database data (`/var/lib/postgresql/data`) |
| `type: bind` | Syncs a specific host file/folder | Init scripts, source code during dev |

Named volumes (`identity-db-data`) survive `docker compose down` — only `down -v` removes them.

---

## Dockerfile Explained

### Go services (flight, booking, search, notification)

All four Go services share the same two-stage pattern:

```dockerfile
FROM golang:1.22-alpine AS builder    # Stage 1: build environment

WORKDIR /app
COPY go.mod go.sum ./                  # Cache go mod download separately
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /flight-service   # Static binary

FROM alpine:3.19                       # Stage 2: minimal runtime image
RUN apk --no-cache add ca-certificates  # TLS certs for HTTPS calls
WORKDIR /app
COPY --from=builder /flight-service /app/flight-service
EXPOSE 8081
CMD ["/app/flight-service"]
```

Why two stages?
- **Builder stage** needs Go toolchain (~800MB). **Runtime stage** needs only ca-certificates (~5MB).
- `CGO_ENABLED=0` produces a fully static binary — no glibc dependency, runs in `alpine` which uses musl libc.
- The final image has nothing but the binary + certs. Attack surface is minimal.

### Python service (identity)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt   # No cache = smaller image
COPY . .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Python images are larger (~200MB) but the service is simple enough that no multi-stage build is needed. `uvicorn` is the ASGI server — it loads the FastAPI app and serves it over HTTP.

### Frontend (React SPA)

```dockerfile
FROM node:20-alpine AS builder          # Stage 1: build the React app
ARG VITE_IDENTITY_URL                   # Build-time args — baked into React app at npm run build
ARG VITE_FLIGHT_URL
ARG VITE_BOOKING_URL
ARG VITE_SEARCH_URL
ENV VITE_IDENTITY_URL=$VITE_IDENTITY_URL   # Passed to Vite, embedded in bundled JS
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build                      # Output goes to ./dist

FROM nginx:alpine                      # Stage 2: serve static files
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 3000; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

Key points:
- **Build args (`ARG`)** are resolved at `docker build` time from the `docker-compose.yml` `args:` block.
- **NGINX `try_files`** — React is a SPA (Single Page App). `try_files $uri $uri/ /index.html` rewrites unknown paths back to `index.html` so React Router can handle them client-side.
- No `node_modules` or build tools in the final image — only the pre-built static files.



---

## What's Next

**Ignition:** Set up a local kind Kubernetes cluster. Then move to **Stage 1** to deploy all 10 components to Kubernetes using Deployments, ConfigMaps, Secrets, and Jobs.

**Before moving on, make sure you can answer:**
1. How does Docker Compose DNS work — how does `booking` resolve `flight`?
2. What happens if you run `docker compose up` before the PostgreSQL init scripts finish?
3. Why does the frontend Dockerfile use multi-stage builds?