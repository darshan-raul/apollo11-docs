---
title: "Launchpad — Container Foundations with Docker Compose"
description: "Master container internals, image layers, Linux namespaces, Compose networking, health checks, and failure propagation using Apollo Airlines."
sidebar_label: "Launchpad (Docker Compose)"
---

# Launchpad: Container Foundations with Docker Compose

:::info[Page type · build and investigate]
Run this only after the four Launchpad chapters. It expects Apollo11 commit
`69113dcc80f77e32301d8ee7b9e73a67c923de96` (see [setup](./labs/setup#revision-and-verification-boundary)); verify it in [lab setup](./labs/setup).
:::

:::note[Take the controls · Launchpad lab]
Build the airline’s first containers, then follow what happens when they start, connect, and fail.
For the explanation before the experiment, start with the
[Launchpad chapters](./learn/containers/process-image-container). You can return to this lab whenever you’re ready.

Already read them? [Jump to the investigations](#-investigations).
:::

Before Kubernetes makes sense, it helps to run into the problem it solves. Start
with Apollo Airlines on one laptop. The application is already split into several
services: `booking` needs other services and databases. But with Docker Compose
everything still runs on one machine, on one network, with one person at the
terminal.

In this chapter you do not learn Kubernetes commands yet. You learn what a running
application is made of: a process, an image filesystem, a network identity,
dependencies, and data. All of this stays true when the process later runs in a
Pod. Kubernetes gives you a way to declare and coordinate these things. It does
not remove them.

<details>
<summary><strong>Optional conceptual refresher</strong></summary>

The chapters linked above are the primary explanation. Expand this refresher if
you want the older all-in-one account beside the lab.

---

## 🎯 Learning Goals

By the end of this stage, you will be able to:
1. Explain how containers differ from virtual machines, using Linux namespaces and cgroups.
2. Describe Dockerfile image layers, cache reuse, and running as a non-root user.
3. Tell internal container-to-container DNS apart from publishing a port on the host.
4. Explain why browser code for the frontend has different security and networking limits than the backend services.
5. Compare `/healthz` (is the process alive) with `/readyz` (is it ready, including its dependencies).
6. See how a failure spreads through the dependencies between services.
7. Explain why Docker Compose is not enough for production clusters, and why Kubernetes is needed.

---

## 📦 First question: what are we actually running?

### What is a container? (containers and virtual machines)

A browser can open Apollo Airlines, but it is not talking to "a container" in the
abstract. It is talking to an ordinary process. The useful question is what makes
that process seem separate from the host and from the other nine processes. A
common misunderstanding is that a container is a lightweight virtual machine. It
is not.

In a **virtual machine (VM)**:
- A hypervisor (such as KVM, VMware, or Hyper-V) divides the physical hardware into virtual CPUs, memory, disks, and network cards.
- Each VM runs a complete guest operating system, with its own Linux or Windows kernel, init system, device drivers, and background services.
- Booting takes from tens of seconds to minutes, and each VM uses gigabytes of memory for its own overhead.

In a **container**:
- There is **no guest operating system** and **no hypervisor**.
- A container is an ordinary Linux process that runs directly on the host's Linux kernel. Two kernel features restrict it:
  1. **Linux namespaces** (isolation) limit what the process can *see*.
     - `pid` namespace: isolates process IDs. Inside the container, your application is PID 1 and cannot see host processes.
     - `net` namespace: gives the container its own virtual network interface (`eth0`), routing table, and private IP address.
     - `mnt` namespace: isolates filesystem mounts, so the container sees only the root filesystem of its image.
     - `ipc` namespace: isolates inter-process communication, such as shared memory and message queues.
     - `uts` namespace: lets the container have its own hostname.
     - `user` namespace: maps user IDs in the container to unprivileged user IDs on the host.
  2. **Control groups (cgroups)** (resource limits) limit what the process can *use*.
     - They cap CPU shares, memory, disk I/O, and the number of processes, using both hard and soft limits.
     - When a container goes over its memory limit, the kernel's **OOM (out-of-memory) killer** terminates the process.

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

Because containers share the host kernel, they usually start faster and use less
memory than a full VM. For this guide, the more important point is simpler: a
container can be thrown away and replaced. If it needs data that lasts, a stable
network address, or something to watch over it, you have to provide those
yourself. You will see all three needs come up in Apollo Airlines.

---

## 🏗️ Dockerfiles: building secure, layered images

Every service in Apollo Airlines has a `Dockerfile`. This is the one for the
Go-based `booking` service:

*Source: `stages/launchpad/code/booking/Dockerfile`*

```dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /booking-service

FROM alpine:3.19

RUN apk --no-cache add ca-certificates \
    && addgroup -S apollo \
    && adduser -S -G apollo apollo

WORKDIR /app

COPY --from=builder --chown=apollo:apollo /booking-service /app/booking-service

ENV DATABASE_URL=postgresql://postgres:postgres@booking-db:5432/booking

EXPOSE 8082

USER apollo

CMD ["/app/booking-service"]
```

### The Dockerfile describes two environments

The first image is a workshop. It holds a compiler and the source code so that
Docker can build `booking`. The second image is what actually runs. This split
answers two separate questions: *how do we build it?* and *what has to be there
when it serves a request?*

1. **Multi-stage build:**
   - The build stage uses `golang:1.22-alpine`, which contains the Go compiler and SDK.
   - The final stage copies *only* the compiled static binary into a clean `alpine:3.19` image, which is much smaller.
   - The result is a smaller attack surface, no compiler tools in the running image, and faster downloads.
2. **Layer caching:**
   - `COPY go.mod go.sum ./` comes **before** `COPY . .`.
   - Docker caches each image layer. When you edit the Go code in `main.go`, Docker reuses the cached layer from `go mod download`. It downloads dependencies again only when they change.
3. **Running as a non-root user (`USER apollo`):**
   - The `adduser -S` line creates a system user named `apollo`, and `USER apollo` makes the process run as that user instead of root. This limits what an attacker who takes over the process can do *inside that container*.
   - It is one layer of defense. It does not guarantee anything about whether an attacker could escape the container and reach the host. The Compose file adds a read-only root filesystem and dropped Linux capabilities for the same process, as you will see below.
4. **A default `DATABASE_URL`:**
   - The `ENV DATABASE_URL=...` line is only a default for running the image on its own. Compose overrides it with the value from `.env`, so the real credentials do not come from the image.

---

## 📜 Docker Compose: running several containers together

If you started ten containers one at a time, it would be easy to lose track of
which database belongs to which service, which ports are public, and which data
must outlive a container. **Docker Compose** records all of this in one file. It
is your first example of configuration that describes a desired local setup
instead of a series of shell commands.

Here is how the `booking` service and its database are defined:

*Source: `stages/launchpad/docker-compose.yml`. The excerpts for `booking`,
`booking-db`, the network, and the volume are combined below. The other services
are left out.*

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

# ...the other Apollo Airlines services and named volumes are left out...

networks:
  apollo-airlines:
    driver: bridge

volumes:
  booking-db-data:
```

### Read the relationships, not the order of the YAML

The `booking` section does not run "before" `booking-db` just because it appears
above it. It declares relationships that Docker must respect when it creates the
containers. Read the fields with one question in mind: what does `booking` need
to turn an HTTP request into a reservation?

- **`networks: [apollo-airlines]`:**
  Docker creates a private bridge network. Docker runs a DNS resolver for it at `127.0.0.11`, and every container can look up the others by service name. For example, `booking` can resolve `booking-db`, `flight`, `identity`, and `notification`.
- **`ports: ["8082:8082"]`:**
  publishes a port on the host (`host_port:container_port`). It listens on port `8082` on your laptop and forwards the traffic, through `iptables` or Docker's proxy, to port `8082` inside the container.
:::important[Host ports and internal DNS]
`booking` calls `http://flight:8081` through Docker's internal DNS. It must **never** call `http://localhost:8081`, because inside a container `localhost` means the container itself.
:::
- **`read_only: true` and `tmpfs: [/tmp]`:**
  the container's root filesystem is mounted read-only. If an attacker takes over the process, they cannot overwrite system binaries or install malware there. Temporary files, such as buffers or PID files, can only go to an in-memory `tmpfs` at `/tmp`.
- **`cap_drop: [ALL]` and `no-new-privileges:true`:**
  the first drops all the default Linux capabilities (such as `CAP_NET_RAW` and `CAP_SYS_ADMIN`). The second stops child processes from gaining privileges through setuid binaries.
- **`depends_on: { condition: service_healthy }`:**
  controls start order. Compose waits until the listed dependencies report healthy before it starts `booking`. It does not keep checking them while `booking` runs. Exercise 3 shows this limit: if a database fails later, a running process can become unready.

---

## 🌐 Network boundaries: the browser and the backend services

Look at how `docker-compose.yml` configures the `frontend` service:

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

### Why does the frontend use `localhost` when backend services use service names?

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

1. **The frontend JavaScript runs in your browser**, on your laptop's operating system. Your browser cannot resolve names on Docker's private bridge network (`http://booking`). It has to reach the APIs through published host ports (`http://localhost:8082`).
2. **The backend services run inside Docker containers.** When `booking` calls `flight`, the request travels across the `apollo-airlines` bridge network, using Docker's internal DNS: `http://flight:8081`.

:::warning[Vite environment variables are public]
Vite environment variables that start with `VITE_` are compiled into the frontend's JavaScript at build time. Anyone can read them with the browser's developer tools. Never put passwords, database connection strings, or signing keys in a `VITE_*` variable.
:::

---

## 🩺 A process can be alive and still be unable to do its job

Imagine that `flight-db` stops after `flight` has started. The `flight` process
may still accept TCP connections and answer a simple "are you alive?" request, but
it cannot answer a customer who asks for flights. If you treat both situations as
one yes-or-no state, you make the wrong recovery decisions. Apollo Airlines
therefore exposes separate endpoints, so an operator can tell them apart.

*Sources: the service code under `stages/launchpad/code/` and
`stages/launchpad/docker-compose.yml`.*

1. **`/healthz` (liveness):**
   - *"Is the process alive, responding, and not deadlocked?"*
   - It checks only the server's own internal state.
   - If `/healthz` fails, the process is stuck or has crashed and should be restarted.
2. **`/readyz` (readiness):**
   - *"Can this service handle user requests right now?"*
   - It checks the connections to the services it depends on, for example a database ping or a Redis ping.
   - If `flight-db` is down, `flight`'s `/readyz` fails and returns HTTP 503.
   - **Key point:** a failing `/readyz` does **not** mean the container should be restarted. Restarting `flight` cannot fix a broken `flight-db`. Instead, it tells a load balancer: *"Stop sending me traffic until my database is back."*
3. **`/metrics` (telemetry):**
   - Exposes metrics in the Prometheus text format, such as HTTP request counts and latency histograms.

---

</details>

## 🧪 Investigations

Each investigation asks one question. Read it before you run the commands and
make a prediction first. Details such as container IDs, IPs, and timing will be
different on your machine. The relationship being tested will not.

### Exercise 1: Build and start Apollo Airlines

**Question:** when Compose says the stack is up, what evidence shows that the
application processes are running and their health checks have settled?

- **Objective**: Build all the images, start the containers on their shared network, and check that the services are running.
- **Starting Point**: A terminal inside the Apollo11 repository.
- **Instructions**:

```bash
cd stages/launchpad

# 1. Create the local environment file from the template in the repository
cp .env.example .env

# 2. Build and start all 10 containers in the background
docker compose up --build -d

# 3. Check the status of the containers
docker compose ps
```

- **Expected result**:
  All 10 containers show `Up (healthy)`. Ports `3000`, `8080`, `8081`, `8082`, `8083`, and `8084` are mapped to `0.0.0.0`.
- **Verification command**:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8081/readyz
curl -s http://localhost:8082/readyz
```

Each should return `{"status":"ok"}` or `{"status":"ready"}` with HTTP status 200.

- **Troubleshooting hints**:
  If a container exits straight away with `variable not set`, make sure you copied `.env.example` to `.env`. Compose uses shell-style expansion (`${VAR:?error}`) to refuse to start with empty credentials.
- **Concept reinforced**: An image is what the build produces. A container is one
  running instance of it, connected to ports, environment variables, networks, and
  storage.

---

### Exercise 2: Inspect the bridge network and DNS

**Prediction:** `booking` can resolve `flight` because both containers are on
Docker's bridge network, while a shell on your host cannot use that short name.
Test the difference instead of taking it on trust.

- **Objective**: Show how containers resolve each other's names, and look at Docker's network.
- **Starting Point**: The Apollo Airlines containers from Exercise 1 are running.
- **Instructions**:

```bash
# 1. Look at the Docker network to see the IP addresses assigned to containers
docker network inspect launchpad_apollo-airlines | grep -E "(Name|IPv4Address)"

# 2. Run a command inside the booking container to resolve the other services' names
docker compose exec booking getent hosts flight identity notification booking-db

# 3. Make an HTTP call from one container to another
docker compose exec booking wget -qO- http://flight:8081/healthz
```

- **Expected result**:
  `getent hosts` prints a private bridge IP (for example `172.x.x.x`) for each service name. The `wget` call to `http://flight:8081/healthz` returns `{"status":"ok"}`.
- **Verification command**: `docker compose exec booking getent hosts
  booking-db` must return an address on the Compose network you inspected.
- **Troubleshooting hints**: Compose builds the network name from the directory
  (project) name. If `launchpad_apollo-airlines` does not exist, run
  `docker network ls` and inspect the network that `docker compose ps` reports.
- **Concept reinforced**:
  In Docker Compose, service discovery is done by DNS built into the bridge
  network. You do not need a separate discovery service such as Consul.

---

### Exercise 3: Dependency failures and readiness

**Prediction:** stopping `flight-db` does not have to kill the `flight` container.
The useful signal is that `flight` cannot do its job, and the services that depend
on it may report the same problem.

- **Objective**: Break a database dependency and see readiness fail while the application process keeps running.
- **Starting Point**: A healthy, running stack.
- **Instructions**:

```bash
# 1. Stop only the flight-db container
docker compose stop flight-db

# 2. Check the readiness of flight, search, and booking
curl -i http://localhost:8081/readyz
curl -i http://localhost:8083/readyz
curl -i http://localhost:8082/readyz

# 3. The liveness endpoint /healthz still reports OK
curl -i http://localhost:8081/healthz
```

- **Expected result**:
  - `/readyz` on `flight` returns `HTTP/1.1 503 Service Unavailable` with a database connection error.
  - `/readyz` on `booking` and `search` also fails or reports a degraded status, because the `flight` service they depend on is not ready.
  - `/healthz` on `flight` returns `HTTP/1.1 200 OK`, because the Gin web server process is still healthy and running.
- **Recovery**:

```bash
# 4. Start flight-db again
docker compose start flight-db

# 5. Poll readiness until the service has recovered
curl --retry 10 --retry-all-errors --fail -i http://localhost:8081/readyz
```

- **Verification command**: Repeat all three `/readyz` calls. They should return
  HTTP 200 once `flight-db` is healthy.
- **Troubleshooting hints**: If readiness stays down, run `docker compose ps` and
  `docker compose logs flight-db flight search booking`. Database recovery and the
  retry loops of the services that depend on it can take several probe intervals.

- **Concept reinforced**:
  Readiness is separate from liveness. If you killed a service every time its
  database went down, you would trigger restart loops across all the services that
  depend on it. With a readiness check, the service stops taking traffic and
  recovers by itself as soon as the dependency comes back.

---

### Exercise 4: Volume persistence versus deleting a container

**Prediction:** a named volume belongs to Docker, not to the short-lived
`identity-db` container. Removing containers without `-v` keeps the volume and its
files. Inserting a unique marker row shows that the data was kept across the
replacement, and was not simply re-created by the init script.

- **Objective**: Show the difference between a container's temporary writable layer and a Docker named volume, using a unique marker row.
- **Starting Point**: The database is initialized and healthy.
- **Instructions**:

```bash
# 1. Insert a unique marker row into identity-db
docker compose exec identity-db psql -U postgres -d identity -c \
  "INSERT INTO users (email, password_hash, first_name) VALUES ('marker@apollo.local', 'hash', 'Marker');"

# 2. Look at the named volume and note its details
docker volume inspect launchpad_identity-db-data

# 3. Stop and remove the containers, WITHOUT removing the volumes
docker compose down

# 4. Start the containers again
docker compose up -d

# 5. Wait for the database to be ready before you query it
until docker compose exec identity-db pg_isready -U postgres -d identity; do sleep 1; done

# 6. Check that your marker row survived the removal of the containers
docker compose exec identity-db psql -U postgres -d identity -c \
  "SELECT email, first_name FROM users WHERE email='marker@apollo.local';"

# 7. Delete the marker row to return to the baseline
docker compose exec identity-db psql -U postgres -d identity -c \
  "DELETE FROM users WHERE email='marker@apollo.local';"
```

- **Expected result**:
  The row for `marker@apollo.local` is still there after the containers are recreated. That address is not in the initial seed script, so this shows that PostgreSQL started from the data kept in the volume, and did not re-run the initialization scripts on an empty disk.
- **Verification command**: `docker volume inspect launchpad_identity-db-data` shows that the volume's storage path on the host did not change.
- **Troubleshooting hints**: If the volume has a different name, run `docker volume ls`. A custom Compose project name changes the prefix.
- **Concept reinforced**: Removing containers does not remove named volumes, unless you explicitly ask for that with `-v`.
:::danger[Do not run this during the learning path]
`docker compose down -v` deletes the named volumes attached to this stage, and the
database records inside them. The cleanup command at the end of this page leaves
out `-v` on purpose. Use the destructive form only when you really want to reset
all Launchpad data, and accept that it cannot be recovered without a backup.
:::

---

### Exercise 5: Security settings and the read-only root filesystem

**Prediction:** the `booking` process needs somewhere to write temporary files,
but it does not need to change its own application binary. The result should show
two filesystem locations that follow different rules.

- **Objective**: Check that the application containers cannot write to their root filesystem.
- **Starting Point**: The containers are running.
- **Instructions**:

```bash
# 1. Try to create a file under /app in the booking container
docker compose exec booking touch /app/hacked.txt

# 2. Try to create a file in /tmp, which is allowed
docker compose exec booking touch /tmp/valid-scratch.txt && echo "Success in /tmp"
```

- **Expected result**:
  Command 1 fails with `touch: /app/hacked.txt: Read-only file system`.
  Command 2 succeeds, because `/tmp` is a writable `tmpfs`.
- **Verification command**: `docker compose exec booking ls -l
  /tmp/valid-scratch.txt` shows the file you were allowed to create.
- **Troubleshooting hints**: If writing to `/app` succeeds, run `docker compose
  config` to see the resolved configuration, and check that `read_only: true`
  belongs to the `booking` service.
- **Concept reinforced**:
  A read-only root filesystem protects a workload from accidental changes. It also
  stops an attacker from dropping binaries or modifying configuration files while
  the container runs.

---

## 🛑 The question Compose leaves open

You have seen Docker Compose run all 10 services on one computer. So why do you
need Kubernetes?

| Capability | Docker Compose | Kubernetes |
|---|---|---|
| **Scheduling across machines** | One machine only. If the laptop or host VM dies, everything stops. | Schedules workloads across anything from a few to thousands of physical or cloud nodes. |
| **Keeping the desired state** | Imperative: it starts containers when you ask. It does not keep enforcing the desired state if someone else deletes a container. | Declarative: it keeps comparing the actual state with the desired state and corrects the difference. |
| **Rolling updates without downtime** | Replaces a container by stopping the old one and starting the new one, which causes a short outage. | Runs rolling updates with extra (surge) Pods, readiness checks, and gradual traffic shifting. |
| **Self-healing and eviction** | Restarts crashed containers on the same machine, but cannot move workloads off a failing server. | The kubelet restarts failed containers, and the controller manager reschedules Pods when a node stops reporting. |
| **Storage** | Local host directories or Docker volumes tied to one machine. | Automatic volume provisioning, attaching cloud disks (AWS EBS, GCP PD), and StatefulSets. |
| **Traffic routing** | Basic port forwarding. | Services with virtual cluster IPs, Ingress controllers, and the Gateway API. |

---

## 🏁 What You Learned

- How Linux namespaces (`pid`, `net`, `mnt`) isolate container processes, and how cgroups limit CPU and memory.
- Why multi-stage Docker builds give small, safer images that run as a non-root user.
- How Docker Compose provides DNS names on a private bridge network.
- Why browsers use the published `localhost` ports, while backend services use internal DNS names.
- The operational difference between `/healthz` (liveness) and `/readyz` (readiness).
- How Docker named volumes outlive the containers that use them.

---

## ✈️ Before Continuing: Checkpoint

Before you move on, make sure you can answer these questions:
1. If you run `kill -9 1` inside a container, does Docker restart it? Why?
2. If `flight-db` is stopped, why does `flight`'s `/readyz` fail while `/healthz` succeeds?
3. Why can the frontend not call `http://booking:8082` directly from the user's browser?
4. What happens to the database contents with `docker compose down` and with `docker compose down -v`?

When you are ready, shut down Launchpad and move on to Kubernetes:

```bash
# Stop the Launchpad containers before you create your cluster
cd stages/launchpad
docker compose down
```

👉 **Continue to [Ignition: Your First Kubernetes Cluster](./ignition)**
