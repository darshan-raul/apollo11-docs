---
title: "Launchpad — Container Foundations with Docker Compose"
description: "Master container internals, image layers, Linux namespaces, Compose networking, health checks, and failure propagation using Apollo Airlines."
sidebar_label: "Launchpad (Docker Compose)"
---

# Launchpad: Container Foundations with Docker Compose

:::note[Take the controls · Launchpad lab]
Build the airline’s first containers, then follow what happens when they start, connect, and fail.
For the explanation before the experiment, start with the
[Launchpad chapters](./learn/containers/process-image-container). You can return to this lab whenever you’re ready.
:::

Before Kubernetes can be useful, it helps to feel the problem it is going to
solve. Start with Apollo Airlines on one laptop. The application is already
distributed: `booking` needs other services and databases, but Docker Compose
still gives us one machine, one network boundary, and one operator at a
terminal.

In this chapter you will not yet “learn Kubernetes commands.” You will learn
what a running application is made of: a process, an image filesystem, a network
identity, dependencies, and data. Those facts remain true when the process
later lives in a Pod. Kubernetes adds a way to declare and coordinate them; it
does not make them disappear.

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

## 📦 First question: what are we actually running?

### What Is a Container? (Containers vs. Virtual Machines)

A browser can open Apollo Airlines, but the browser is not talking to “a
container” in the abstract. It is ultimately talking to a normal process. The
useful question is what makes that process feel separate from the host and from
the other nine processes. A common misconception is that a container is a
lightweight virtual machine. It is not.

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

Because containers share the host kernel, they usually start with less overhead
than a full VM. The important practical consequence for this guide is simpler:
a container is replaceable process state. If it needs durable data, stable
network reachability, or supervision, those needs must be provided explicitly.
You will watch all three needs surface in Apollo Airlines.

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

### Read this Dockerfile as a story of two environments

The first image is a workshop: it contains a compiler and source code so Docker
can produce `booking`. The second image is the thing that will actually run.
That separation answers two different questions: *how do we build it?* and
*what must be present when it serves a request?*

1. **Multi-Stage Builds**:
   - The build stage uses `golang:1.22-alpine` containing the Go compiler, SDK, and Git (~300 MB).
   - The final stage copies *only* the compiled static binary into a clean `alpine:3.19` base (~15 MB).
   - Result: Minimal attack surface, zero compiler tools in production, fast download times.
2. **Layer Caching Optimization**:
   - `COPY go.mod go.sum ./` is executed **before** `COPY . .`.
   - Docker caches image layers. If you edit Go source code in `main.go`, Docker reuses the cached layer from `go mod download`. It only re-runs dependency downloads when dependencies change.
3. **Non-root execution (`USER appuser`)**:
   - The runtime process has UID 1000 inside the container rather than UID 0.
     That reduces what a compromised process can do *inside that container*.
   - It is one layer of defense, not a promise that a container escape grants or
     prevents host access. Launchpad later adds a read-only root filesystem and
     dropped Linux capabilities around the same process.

---

## 📜 Docker Compose: Multi-Container Coordination

Running ten containers one by one would make the relationships easy to lose:
which database belongs to which service, which port is public, and which data
must outlive a container. **Docker Compose** records those relationships in one
file. It is our first example of configuration that describes a desired local
arrangement rather than a sequence of shell commands.

Let's examine how the `booking` service and its database are defined:

*Source: `stages/launchpad/docker-compose.yml`; exact `booking`, `booking-db`,
network, and volume excerpts are assembled below, with unrelated services
omitted.*

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

# ...other Apollo Airlines services and named volumes are omitted...

networks:
  apollo-airlines:
    driver: bridge

volumes:
  booking-db-data:
```

### Follow the relationships, not the YAML order

The `booking` section does not run “before” `booking-db` because it appears
above it. Instead, it declares several relationships Docker must honor when it
creates containers. Read the fields with one request in mind: what does booking
need in order to turn an HTTP request into a reservation?

- **`networks: [apollo-airlines]`**:
  Docker creates an isolated software bridge network. Inside this network, Docker runs an internal DNS resolver at `127.0.0.11`. Any container can resolve peer containers by their service name (e.g. `booking` resolves `booking-db`, `flight`, `identity`, and `notification`).
- **`ports: ["8082:8082"]`**:
  Host port forwarding (`host_port:container_port`). It binds port `8082` on your laptop's network interface and forwards incoming packets through `iptables` / Docker proxy into the container's private port `8082`.
:::important[Host Ports vs Internal DNS]
`booking` calls `http://flight:8081` using internal Docker DNS. It must **never** call `http://localhost:8081`, because `localhost` inside a container resolves to that container's own network namespace!
:::
- **`read_only: true` and `tmpfs: [/tmp]`**:
  The container root filesystem is mounted as read-only. Even if an attacker compromises the process, they cannot overwrite system binaries or install malware on the filesystem. Any temporary file creation (such as buffering or PID files) is restricted to an in-memory `tmpfs` mounted at `/tmp`.
- **`cap_drop: [ALL]` and `no-new-privileges:true`**:
  Drops all default Linux kernel capabilities (such as `CAP_NET_RAW`, `CAP_SYS_ADMIN`), and prevents child processes from elevating privileges using setuid binaries.
- **`depends_on: { condition: service_healthy }`**:
  Controls Compose startup ordering: it waits for the listed dependencies to
  report healthy before starting `booking`. It does not keep checking those
  dependencies for the lifetime of `booking`. Exercise 3 makes that limitation
  visible: a later database failure can make a running process unready.

---

## 🌐 Network Boundaries: Browser vs. Backend Microservices

Notice how the `frontend` service is configured in `docker-compose.yml`:

*Source: `stages/launchpad/docker-compose.yml` (abridged `frontend` service)*

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

:::warning[Vite Environment Variables are Public]
Vite environment variables starting with `VITE_*` are compiled directly into the frontend static JavaScript bundle at build time. Anyone who opens the browser's Developer Tools can inspect them. Never put passwords, database connection strings, or signing keys into `VITE_*` variables!
:::

---

## 🩺 A process can be alive and still be unable to help

Now imagine that `flight-db` stops after `flight` has started. The `flight`
process may still accept TCP connections and answer a simple “are you alive?”
request, yet it cannot answer a customer asking for flights. Treating both
states as one boolean causes bad recovery decisions. Apollo Airlines exposes
separate endpoints so an operator can tell the difference.

*Sources: the service implementations under `stages/launchpad/code/` and
`stages/launchpad/docker-compose.yml`.*

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

## 🧪 Investigations

Each investigation asks one question. Read that question before running the
commands; make a prediction first. Dynamic details such as container IDs, IPs,
and timing will differ on your machine. The relationship being tested should
not.

### Exercise 1: Build and Launch Apollo Airlines

**Question:** When Compose says the stack is up, which evidence tells us that
the application processes and their declared health checks have actually
settled?

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
- **Concept reinforced**: An image is the build artifact; a container is one
  runtime instance wired to ports, environment, networks, and storage.

---

### Exercise 2: Inspecting Bridge Networking and DNS

**Prediction:** `booking` can resolve `flight` because both containers belong
to Docker's bridge network, while your host shell cannot use that same short
name. Test that difference rather than taking it on faith.

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
- **Verification command**: `docker compose exec booking getent hosts
  booking-db` must return an address attached to the inspected Compose network.
- **Troubleshooting hints**: Compose derives the default network prefix from
  the directory/project name. If `launchpad_apollo-airlines` is absent, run
  `docker network ls` and inspect the network reported by `docker compose ps`.
- **What Concept This Reinforces**:
  Service discovery in Docker Compose is handled entirely by embedded DNS on the bridge network. No external discovery service or Consul agent is needed.

---

### Exercise 3: Dependency Cascading & Readiness Propagation

**Prediction:** stopping `flight-db` should not necessarily kill the `flight`
container. Instead, the useful signal is that `flight` cannot perform its job,
and services that depend on it may report the same problem.

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

- **Verification command**: Repeat all three `/readyz` calls and confirm they
  return to HTTP 200 after `flight-db` is healthy.
- **Troubleshooting hints**: If readiness stays down, inspect `docker compose
  ps` and `docker compose logs flight-db flight search booking`; database
  recovery and downstream retry loops can take several probe intervals.

- **What Concept This Reinforces**:
  Readiness is separate from liveness. Killing a service because its database went offline causes a "thundering herd" of restart loops. Proper readiness allows the service to pause traffic ingestion and automatically recover the moment the dependency is restored.

---

### Exercise 4: Testing Volume Persistence vs. Container Deletion

**Prediction:** a named volume belongs to Docker, not to the short-lived
`identity-db` container. Removing containers without `-v` therefore differs
from deleting the volume itself.

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
- **Verification command**: `docker volume inspect
  launchpad_identity-db-data` should succeed before and after `docker compose
  down`.
- **Troubleshooting hints**: If the volume name differs, inspect `docker volume
  ls`; a custom Compose project name changes the generated prefix.
- **Concept reinforced**: Removing containers does not remove named volumes
  unless cleanup explicitly requests volume deletion.
- **Destructive Test**:
  If you run `docker compose down -v`, the `-v` flag instructs Docker to **destroy all attached named volumes**. Subsequent startup would recreate clean, empty databases.

---

### Exercise 5: Security Context & Read-Only Root Filesystem

**Prediction:** the `booking` process needs a place for temporary writes but
does not need to change its application binary. The result should show that
these are different filesystem locations with different rules.

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
- **Verification command**: `docker compose exec booking ls -l
  /tmp/valid-scratch.txt` shows the allowed scratch file.
- **Troubleshooting hints**: If writing `/app` succeeds, inspect the resolved
  model with `docker compose config` and confirm `read_only: true` belongs to
  the `booking` service.
- **What Concept This Reinforces**:
  Immutable, read-only root filesystems protect workloads against accidental file pollution and attackers attempting to drop binaries or modify configuration files at runtime.

---

## 🛑 The question Compose leaves open

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
