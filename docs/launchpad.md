---
title: "Launchpad — Container Foundations with Docker Compose"
description: "Master container internals, image layers, Linux namespaces, Compose networking, health checks, and failure propagation using Apollo Airlines."
sidebar_label: "Launchpad (Docker Compose)"
---

# Launchpad: Container Foundations with Docker Compose

Before introducing Kubernetes and its complex control plane abstractions, you must build a solid, concrete mental model of what a container actually is.

In **Launchpad**, you deploy the complete 10-component Apollo Airlines application on your laptop using **Docker** and **Docker Compose**. You will inspect container namespaces, trace DNS calls across a private bridge network, watch how database failures propagate through readiness checks, and prove volume persistence.

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Explain how containers differ from virtual machines using Linux namespaces and cgroups.
2. Understand Dockerfile image layering, cache reuse, and non-root security boundaries.
3. Distinguish internal container-to-container DNS from host port publishing.
4. Explain why frontend browser code has different security and networking boundaries than backend microservices.
5. Contrast `/healthz` (vitality) with `/readyz` (dependency-aware readiness).
6. Observe failure cascading across a microservice dependency graph.
7. Articulate why Docker Compose is insufficient for production clustering and why Kubernetes is needed.

---

## 📦 Concepts: Images, Containers, and Linux Primitives

### What Is a Container? (Containers vs. Virtual Machines)

A common misconception is that *"a container is a lightweight virtual machine."* It is not.

In a **Virtual Machine (VM)**:
- A hypervisor (such as KVM, VMware, or Hyper-V) slices physical hardware into virtualized CPU, memory, disks, and network cards.
- Each VM runs an entire guest operating system, with its own independent Linux or Windows kernel, systemd init system, device drivers, and background daemons.
- Booting takes tens of seconds to minutes, and memory overhead is measured in gigabytes per VM.

In a **Container**:
- There is **no guest operating system** and **no hypervisor**.
- A container is simply an ordinary Linux process running directly on the host Linux kernel, constrained by two fundamental Linux kernel features:
  1. **Linux Namespaces** (Isolation): What the process can *see*.
     - `pid` namespace: Isolates process IDs. Inside the container, your application process thinks it is PID 1, completely blind to host processes.
     - `net` namespace: Gives the container its own virtual network interface (`eth0`), routing table, and private IP address.
     - `mnt` namespace: Isolates filesystem mount points, so the container only sees its own image rootfs.
     - `ipc` namespace: Isolates Inter-Process Communication (shared memory, message queues).
     - `uts` namespace: Allows the container to have its own hostname.
     - `user` namespace: Maps container user IDs to unprivileged host user IDs.
  2. **Control Groups (cgroups)** (Resource Limits): What the process can *use*.
     - Sets hard and soft ceilings on CPU shares, memory consumption, disk I/O, and maximum process count (pids).
     - When a container exceeds its memory cgroup limit, the Linux kernel triggers an **OOM (Out-Of-Memory) killer** and terminates the process.

```
┌────────────────────────────────────────────────────────┐
│                   VIRTUAL MACHINE                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Application Code & Binaries                      │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ Guest Operating System (Kernel, Drivers, Systemd)│  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Hypervisor (Hardware Virtualization Layer)       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Host OS Kernel & Physical Hardware               │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                      CONTAINER                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Application Code, Dependencies & Root Filesystem │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ Isolated via Linux Namespaces & cgroups          │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Host Linux Kernel (Shared Directly)              │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Physical / Virtual Host Hardware                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Because containers share the host kernel, they start in milliseconds and incur virtually zero CPU or memory virtualization overhead.

---

## 🏗️ Dockerfiles: Building Secure, Layered Images

Every service in Apollo Airlines has a `Dockerfile`. Consider the Go-based `booking` service Dockerfile:

*Source: `stages/launchpad/code/booking/Dockerfile`*

```dockerfile
# Stage 1: Build binary using official Go toolchain
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o booking .

# Stage 2: Minimal runtime image
FROM alpine:3.19
RUN adduser -D -u 1000 appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appuser /app/booking .
USER appuser
EXPOSE 8082
ENTRYPOINT ["/app/booking"]
```

### Key Engineering Principles Observed Here:

1. **Multi-Stage Builds**:
   - The build stage uses `golang:1.22-alpine` containing the Go compiler, SDK, and Git (~300 MB).
   - The final stage copies *only* the compiled static binary into a clean `alpine:3.19` base (~15 MB).
   - Result: Minimal attack surface, zero compiler tools in production, fast download times.
2. **Layer Caching Optimization**:
   - `COPY go.mod go.sum ./` is executed **before** `COPY . .`.
   - Docker caches image layers. If you edit Go source code in `main.go`, Docker reuses the cached layer from `go mod download`. It only re-runs dependency downloads when dependencies change.
3. **Non-Root Execution (`USER appuser`)**:
   - By default, containers run as `root` (UID 0). If an attacker escapes a container running as root, they are root on the host machine.
   - Apollo11 creates `appuser` (UID 1000) and switches to it before launching the process.

---

## 📜 Docker Compose: Multi-Container Coordination

Running 10 containers individually with `docker run` commands would require pages of manual shell commands, port mappings, volume attachments, and IP arguments.

**Docker Compose** is a declarative tool that lets you describe a multi-container application in a single YAML file (`docker-compose.yml`).

Let's examine how the `booking` service and its database are defined:

*Source: `stages/launchpad/docker-compose.yml`*

```yaml
services:
  booking:
    build:
      context: ./code/booking
      dockerfile: Dockerfile
    restart: always
    ports:
      - "8082:8082"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:?Copy .env.example to .env}:${POSTGRES_PASSWORD:?Copy .env.example to .env}@booking-db:5432/booking
      FLIGHT_SERVICE_URL: http://flight:8081
      IDENTITY_SERVICE_URL: http://identity:8080
      NOTIFICATION_SERVICE_URL: http://notification:8084
      JWT_SECRET: ${JWT_SECRET:?Copy .env.example to .env}
      PORT: "8082"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:8082/readyz"]
      interval: 5s
      timeout: 3s
      retries: 10
    depends_on:
      booking-db:
        condition: service_healthy
      flight:
        condition: service_healthy
      identity:
        condition: service_healthy
      notification:
        condition: service_healthy
    networks:
      - apollo-airlines

  booking-db:
    image: postgres:15-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d booking"]
      interval: 5s
      timeout: 5s
      retries: 10
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?Copy .env.example to .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Copy .env.example to .env}
      POSTGRES_DB: booking
    volumes:
      - type: volume
        source: booking-db-data
        target: /var/lib/postgresql/data
      - type: bind
        source: ./code/booking/init.sql
        target: /docker-entrypoint-initdb.d/init.sql
    networks:
      - apollo-airlines

networks:
  apollo-airlines:
    driver: bridge

volumes:
  booking-db-data:
```

### Deep Dive into the Compose Fields:

- **`networks: [apollo-airlines]`**:
  Docker creates an isolated software bridge network. Inside this network, Docker runs an internal DNS resolver at `127.0.0.11`. Any container can resolve peer containers by their service name (e.g. `booking` resolves `booking-db`, `flight`, `identity`, and `notification`).
- **`ports: ["8082:8082"]`**:
  Host port forwarding (`host_port:container_port`). It binds port `8082` on your laptop's network interface and forwards incoming packets through `iptables` / Docker proxy into the container's private port `8082`.
  :::important Host Ports vs Internal DNS
  `booking` calls `http://flight:8081` using internal Docker DNS. It must **never** call `http://localhost:8081`, because `localhost` inside a container resolves to that container's own network namespace!
  :::
- **`read_only: true` and `tmpfs: [/tmp]`**:
  The container root filesystem is mounted as read-only. Even if an attacker compromises the process, they cannot overwrite system binaries or install malware on the filesystem. Any temporary file creation (such as buffering or PID files) is restricted to an in-memory `tmpfs` mounted at `/tmp`.
- **`cap_drop: [ALL]` and `no-new-privileges:true`**:
  Drops all default Linux kernel capabilities (such as `CAP_NET_RAW`, `CAP_SYS_ADMIN`), and prevents child processes from elevating privileges using setuid binaries.
- **`depends_on: { condition: service_healthy }`**:
  Ensures `booking` will not start until `booking-db`, `flight`, `identity`, and `notification` pass their healthchecks.

---

## 🌐 Network Boundaries: Browser vs. Backend Microservices

Notice how the `frontend` service is configured in `docker-compose.yml`:

```yaml
frontend:
  build:
    context: ./code/frontend
    dockerfile: Dockerfile
    args:
      VITE_IDENTITY_URL: http://localhost:8080
      VITE_FLIGHT_URL: http://localhost:8081
      VITE_BOOKING_URL: http://localhost:8082
      VITE_SEARCH_URL: http://localhost:8083
  ports:
    - "3000:3000"
```

### Why does the frontend use `localhost` while backend services use service names?

```
┌────────────────────────────────────────────────────────────────────────┐
│ USER LAPTOP / WORKSTATION                                              │
│                                                                        │
│  ┌─────────────────────────┐                                           │
│  │ WEB BROWSER             │                                           │
│  │ (Runs JavaScript on     │ ──── calls http://localhost:8082 ────┐    │
│  │  the user's host OS)    │                                      │    │
│  └─────────────────────────┘                                      │    │
│               │                                                   │    │
│      downloads HTML/JS                                            │    │
│      from http://localhost:3000                                   │    │
│               ▼                                                   │    │
│  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │ DOCKER BRIDGE NETWORK: apollo-airlines                      │  │    │
│  │                                                             │  │    │
│  │  ┌──────────────┐         ┌──────────────┐                  │  │    │
│  │  │ frontend     │         │ booking      │ ◄────────────────┘  │    │
│  │  │ (NGINX serves│         │ (Go / Gin    │                     │    │
│  │  │  static files│         │  API server) │                     │    │
│  │  └──────────────┘         └──────────────┘                     │    │
│  │                                  │                             │    │
│  │                       calls http://flight:8081                 │    │
│  │                       via Docker internal DNS                  │    │
│  │                                  ▼                             │    │
│  │                           ┌──────────────┐                     │    │
│  │                           │ flight       │                     │    │
│  │                           │ (Go / Gin)   │                     │    │
│  │                           └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────────────┘  │    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Frontend JavaScript runs inside your browser**, which executes on your laptop's host operating system. Your browser cannot resolve Docker's private bridge network DNS (`http://booking`). It must access APIs via published host ports (`http://localhost:8082`).
2. **Backend microservices run inside Docker containers**. When `booking` wants to talk to `flight`, it sends packets directly across the `apollo-airlines` bridge network using Docker's internal DNS resolver: `http://flight:8081`.

:::warning Vite Environment Variables are Public
Vite environment variables starting with `VITE_*` are compiled directly into the frontend static JavaScript bundle at build time. Anyone who opens the browser's Developer Tools can inspect them. Never put passwords, database connection strings, or signing keys into `VITE_*` variables!
:::

---

## 🩺 Health vs. Readiness: The Two Invariants

Apollo Airlines microservices implement three standardized HTTP endpoints:

1. **`/healthz` (Vitality / Liveness)**:
   - *"Is the container process alive, responsive, and not deadlocked?"*
   - Checks only internal server state (event loop, thread pool).
   - If `/healthz` fails, the process is stuck or crashed and must be restarted.
2. **`/readyz` (Readiness / Dependency Gating)**:
   - *"Can this service fulfill incoming user transactions right now?"*
   - Actively checks connections to critical downstream dependencies (e.g. database ping, Redis ping).
   - If `flight-db` is down, `flight`'s `/readyz` fails (returning HTTP 503).
   - **Crucial distinction**: Failing `/readyz` does **not** mean the container should be restarted! Restarting `flight` will not fix a broken `flight-db`. Instead, it tells the load balancer: *"Stop sending user traffic to me until my database recovers."*
3. **`/metrics` (Telemetry)**:
   - Exposes Prometheus-compatible text metrics (HTTP request counts, latency histograms).

---

## 🧪 Hands-On Guided Exercises

Let's start the application and put our mental model to the test.

### Exercise 1: Build and Launch Apollo Airlines

- **Objective**: Build all images, launch the multi-container network, and verify running services.
- **Starting Point**: Terminal inside the Apollo11 repository.
- **Instructions**:

```bash
cd stages/launchpad

# 1. Create the local environment file from the committed template contract
cp .env.example .env

# 2. Build and launch all 10 containers in detached background mode
docker compose up --build -d

# 3. Check container status
docker compose ps
```

- **Expected Result**:
  All 10 containers show `Up (healthy)`. Ports `3000`, `8080`, `8081`, `8082`, `8083`, `8084` are mapped to `0.0.0.0`.
- **Verification Command**:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8081/readyz
curl -s http://localhost:8082/readyz
```

Expected output for each:
`{"status":"ok"}` or `{"status":"ready"}` with HTTP status code 200.

- **Troubleshooting Hints**:
  If a container exits immediately with `variable not set`, ensure you copied `.env.example` to `.env`. Compose uses bash-style parameter expansion (`${VAR:?error}`) to prevent running with empty credentials.

---

### Exercise 2: Inspecting Bridge Networking and DNS

- **Objective**: Prove how containers resolve peer services and inspect Docker's network namespace.
- **Starting Point**: Apollo Airlines containers running from Exercise 1.
- **Instructions**:

```bash
# 1. Inspect the Docker network to see container IP assignments
docker network inspect launchpad_apollo-airlines | grep -E "(Name|IPv4Address)"

# 2. Exec into the booking container and resolve peer service DNS names
docker compose exec booking getent hosts flight identity notification booking-db

# 3. Test an internal HTTP call between containers
docker compose exec booking wget -qO- http://flight:8081/healthz
```

- **Expected Result**:
  `getent hosts` prints private bridge IPs (e.g. `172.x.x.x`) for each service name. `wget` to `http://flight:8081/healthz` returns `{"status":"ok"}`.
- **What Concept This Reinforces**:
  Service discovery in Docker Compose is handled entirely by embedded DNS on the bridge network. No external discovery service or Consul agent is needed.

---

### Exercise 3: Dependency Cascading & Readiness Propagation

- **Objective**: Break a database dependency and observe how readiness fails without crashing the application process.
- **Starting Point**: Healthy running cluster.
- **Instructions**:

```bash
# 1. Stop only the flight-db container
docker compose stop flight-db

# 2. Check the health status of flight, search, and booking
curl -i http://localhost:8081/readyz
curl -i http://localhost:8083/readyz
curl -i http://localhost:8082/readyz

# 3. Notice that the liveness / healthz endpoint is STILL OK
curl -i http://localhost:8081/healthz
```

- **Expected Result**:
  - `/readyz` on `flight` returns `HTTP/1.1 503 Service Unavailable` with database connection error.
  - `/readyz` on `booking` and `search` also fail or report degraded status because their required upstream flight dependency is unready.
  - `/healthz` on `flight` returns `HTTP/1.1 200 OK` because the Gin web server process is still healthy and running!
- **Recovery**:

```bash
# 4. Restart flight-db
docker compose start flight-db

# 5. Poll readiness until recovery completes
curl --retry 10 --retry-all-errors --fail -i http://localhost:8081/readyz
```

- **What Concept This Reinforces**:
  Readiness is separate from liveness. Killing a service because its database went offline causes a "thundering herd" of restart loops. Proper readiness allows the service to pause traffic ingestion and automatically recover the moment the dependency is restored.

---

### Exercise 4: Testing Volume Persistence vs. Container Deletion

- **Objective**: Prove the difference between container memory/disk and Docker named volumes.
- **Starting Point**: Database initialized and seeded.
- **Instructions**:

```bash
# 1. Query users from identity-db
docker compose exec identity-db psql -U postgres -d identity -c "SELECT email FROM users LIMIT 1;"

# 2. Stop and remove the containers (WITHOUT removing volumes)
docker compose down

# 3. Start containers back up
docker compose up -d

# 4. Check if the database data survived
docker compose exec identity-db psql -U postgres -d identity -c "SELECT email FROM users LIMIT 1;"
```

- **Expected Result**:
  The user record is preserved! The named volume `launchpad_identity-db-data` was untouched.
- **Destructive Test**:
  If you run `docker compose down -v`, the `-v` flag instructs Docker to **destroy all attached named volumes**. Subsequent startup would recreate clean, empty databases.

---

### Exercise 5: Security Context & Read-Only Root Filesystem

- **Objective**: Verify that application containers cannot write to their root filesystem.
- **Starting Point**: Running containers.
- **Instructions**:

```bash
# 1. Try to create a file in the root directory /app of booking
docker compose exec booking touch /app/hacked.txt

# 2. Try to create a file in the allowed /tmp directory
docker compose exec booking touch /tmp/valid-scratch.txt && echo "Success in /tmp"
```

- **Expected Result**:
  Command 1 fails with `touch: /app/hacked.txt: Read-only file system`.
  Command 2 succeeds because `/tmp` is mounted as a writable `tmpfs`.
- **What Concept This Reinforces**:
  Immutable, read-only root filesystems protect workloads against accidental file pollution and attackers attempting to drop binaries or modify configuration files at runtime.

---

## 🛑 Why Docker Compose Is Not Enough for Production

You have seen Docker Compose run all 10 services cleanly on one computer. So why do we need Kubernetes?

| Capability | Docker Compose | Kubernetes |
|---|---|---|
| **Multi-Node Scheduling** | Single machine only. If the laptop or host VM dies, everything dies. | Schedules workloads across dozens to thousands of physical or cloud worker nodes. |
| **Desired State Reconciliation** | Imperative: starts containers on request. Does not continuously enforce desired state if an external actor deletes a container. | Declarative: continuously watches observed state and reconciles it with desired state. |
| **Zero-Downtime Rolling Updates** | Replaces containers by stopping the old one and starting the new one, creating brief outages. | Orchestrates rolling updates, surge pods, readiness gates, and traffic shifting. |
| **Self-Healing & Eviction** | Restarts crashed containers locally, but cannot reschedule workloads away from a failing physical server. | Kubelet restarts failed containers; controller-manager reschedules pods if a node stops reporting heartbeats. |
| **Declarative Storage Orchestration** | Local host directories or Docker volumes tied to one machine. | Dynamic volume provisioning, cloud disk attachment (AWS EBS, GCP PD), and StatefulSets. |
| **Advanced Traffic Routing** | Basic port forwarding. | Service abstractions, virtual cluster IPs, Ingress controllers, and Gateway API. |

---

## 🏁 What You Learned

- How Linux namespaces (`pid`, `net`, `mnt`) isolate container processes and cgroups restrict CPU and memory.
- Why multi-stage Docker builds produce lean, secure, non-root container images.
- How Docker Compose provides internal DNS resolution over a private bridge network.
- Why browser clients talk to `localhost` published ports, while backend microservices talk to internal DNS names.
- The fundamental operational difference between `/healthz` (liveness) and `/readyz` (readiness).
- How Docker named volumes outlive container lifecycles.

---

## ✈️ Before Continuing: Checkpoint

Before moving to the next stage, verify you can answer these questions:
1. If you run `kill -9 1` inside a container, does Docker restart it? Why?
2. If `flight-db` is stopped, why does `flight`'s `/readyz` fail while `/healthz` succeeds?
3. Why can't the React frontend call `http://booking:8082` directly from the user's browser?
4. What happens to database contents when running `docker compose down` vs `docker compose down -v`?

When you're ready, shut down Launchpad and step into Kubernetes:

```bash
# Clean up Launchpad containers before creating your cluster
cd stages/launchpad
docker compose down
```

👉 **Continue to [Ignition: Your First Kubernetes Cluster](./ignition)**
