---
title: "Images and runtime configuration"
description: "Learn which parts of Apollo belong in an image, which arrive at runtime, and why changing a value does not always change a running process."
---

# Images and runtime configuration

*Launchpad · Give the airline a repeatable starting point*

The booking service works on one developer’s laptop. Another developer needs to
run it tomorrow, and later the same service needs to run in a cluster. Copying a
folder and remembering a list of setup steps is fragile. A container image gives
Apollo a repeatable starting point: the program, its runtime dependencies, the
files it needs at build time, and the default command that starts it.

An image is deliberately incomplete. It should not permanently decide which
database this particular booking service will contact today, how verbose its logs
should be, or which development credential a local experiment uses. Those facts
belong to the environment in which the image runs.

## Two moments in the life of a service

**Build time** is when an image is assembled. The build chooses the application
code and runtime libraries. Rebuilding changes the artifact available for future
containers; it does not reach into a running booking process and replace its code.

**Runtime** is when a container starts from that image. Environment variables,
mounted files, command arguments, and network addresses can provide the values
that differ between a local Compose environment and a Kubernetes deployment.
This lets one inspected booking image move through environments while its
environment-specific choices stay visible.

~~~mermaid
flowchart LR
  Code[Apollo booking code] --> Build[Image build]
  Runtime[Runtime and libraries] --> Build
  Build --> Image[booking image]
  Image --> Container[booking container]
  Env[Environment values] --> Container
  Files[Mounted configuration] --> Container
  Args[Command arguments] --> Container
  Container --> Process[booking process]
~~~

*Diagram CT-02 — the image determines the starting package; runtime inputs shape
one running copy of that package.*

## Dissecting a Dockerfile: Layers and Multi-Stage Builds

Every service in Apollo Airlines has a `Dockerfile` that defines how to turn source code into an image. Consider the Go-based `booking` service Dockerfile:

```dockerfile title="stages/launchpad/code/booking/Dockerfile"
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

### Key Dockerfile Concepts Every Learner Needs:

1. **Multi-Stage Builds (`FROM ... AS builder`):**
   - The first stage uses `golang:1.22-alpine` containing the Go compiler, SDK, and build tools (~300 MB).
   - The second stage starts fresh with a minimal `alpine:3.19` base (~5 MB) and copies **only** the compiled static binary (`COPY --from=builder`).
   - *Result:* The final production image is ~15 MB instead of 300+ MB, has zero compiler tools for attackers to exploit, and pulls rapidly across the network.
2. **Layer Caching (`COPY go.mod` before `COPY . .`):**
   - Docker executes instructions in order and caches the filesystem diff of each layer.
   - By copying `go.mod` and running `go mod download` *before* copying application source code (`COPY . .`), Docker caches your downloaded dependencies. When you edit code in `main.go`, Docker skips re-downloading dependencies and rebuilds in seconds!
3. **Non-Root Execution (`USER appuser`):**
   - By default, containers run as `root` (UID 0). If a vulnerability exists in your HTTP handler, the attacker runs as root inside that container.
   - `RUN adduser -D -u 1000 appuser` and `USER appuser` drop process privileges to an unprivileged user (UID 1000), enforcing defense-in-depth.

---

## Multi-Container Coordination with Docker Compose

Running Apollo's 10 services manually with ten separate `docker run` commands would be error-prone and tedious. **Docker Compose** records those relationships declaratively in `docker-compose.yml`:

```yaml title="stages/launchpad/docker-compose.yml (Excerpt)"
services:
  booking:
    build:
      context: ./code/booking
      dockerfile: Dockerfile
    ports:
      - "8082:8082"                # host_port:container_port
    environment:
      DATABASE_URL: postgresql://postgres:postgres@booking-db:5432/booking
      FLIGHT_SERVICE_URL: http://flight:8081
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:8082/readyz"]
      interval: 5s
      timeout: 3s
      retries: 10
    depends_on:
      booking-db:
        condition: service_healthy
    networks:
      - apollo-airlines

  booking-db:
    image: postgres:15-alpine
    volumes:
      - booking-db-data:/var/lib/postgresql/data
    networks:
      - apollo-airlines

volumes:
  booking-db-data:

networks:
  apollo-airlines:
    driver: bridge
```

- **`networks`:** Creates a private software bridge. Inside it, Docker runs an embedded DNS resolver at `127.0.0.11`. `booking` contacts `http://flight:8081` using flight's service name!
- **`ports`:** Binds a port on your host laptop and forwards traffic to the container.
- **`depends_on`:** Controls startup ordering based on declared healthchecks.

---

## A configuration change has a delivery path and a timing story

Suppose the booking service receives its database address as an environment
variable. The process reads that value when it starts. Changing the source value
later does not rewrite the process memory of an already-running container. A new
container will see the new value, but the old one will not.

Mounted files can be different. A delivery mechanism may update the file a
container sees, but the application still needs to know when and how to reread
it. Some programs only read configuration during startup. Others watch a file or
offer an explicit reload. “The file changed” and “the service adopted the new
setting” are separate facts.

This is why a reliable change explanation includes all three steps:

1. Where does the value live before the container starts?
2. How is it delivered to the process?
3. What makes the process use the new value?

Kubernetes later gives names to some of these delivery mechanisms: ConfigMaps,
Secrets, environment variables, and volume mounts. The lifecycle rule remains the
same.

## Keep the boundary around credentials

A password should not be placed in an image just because a local lab is easier
that way. Anyone able to inspect or distribute that image may then obtain the
value. A Secret can deliver sensitive data later, but it is a delivery object,
not a complete security design. The system still needs to answer who may read it,
whether it is encrypted, how it is rotated, and whether logs expose it.

For Launchpad, the useful habit is modest: separate reusable application content
from environment-specific values, and keep sensitive values out of the places
that are copied most widely.

## Evidence and limits

You can inspect an image to establish its starting files and command. You can
inspect a running container’s environment or mounted files to establish what was
delivered. You still need application logs or a safe behavioural check to know
whether the process used that configuration successfully.

An image gives repeatability. It does not guarantee that a service can reach its
database, that a credential is authorised, or that a new configuration is valid.
Those questions appear when Apollo starts talking across the network.

## Check your understanding

<details>
<summary>A source value changes, but booking reads its environment only at startup. What must happen before booking uses the new value?</summary>

A new process must start with the changed value, normally through a controlled
container replacement. Updating the source alone does not rewrite process memory.
</details>

<details>
<summary>Why is a password in an image different from one delivered at runtime?</summary>

The reusable image and every copy contain an embedded password. Runtime delivery
separates it from the artifact, though access, encryption, rotation, and logging
still need their own controls.
</details>

