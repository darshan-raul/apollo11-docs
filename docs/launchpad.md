---
title: Launchpad — Docker Compose
description: Run Apollo Airlines locally and learn the container fundamentals used by Kubernetes.
---

# Launchpad — Docker Compose

Launchpad gives you a working mental model before Kubernetes adds another control plane. You will run ten components, read YAML, see Compose DNS, trace a request, break a database dependency, and prove persistence.

## Build

From the Apollo11 repository:

```bash
cd stages/launchpad
cp .env.example .env
docker compose up --build -d
docker compose ps
```

`.env.example` is a variable contract, not a secret. Keep `.env` local. Compose interpolates values such as `${JWT_SECRET:?Copy .env.example to .env}` and fails early when one is missing.

Open `http://localhost:3000`. The API ports are identity `8080`, flight `8081`, booking `8082`, search `8083`, notification `8084`; Dozzle is optional on `8085` with `docker compose --profile tools up -d`.

## Concepts: images, containers, and Compose

An **image** is a packaged filesystem and startup configuration. A **container** is a running process created from that image. Containers are lighter than virtual machines because they share the host kernel; isolation comes from Linux namespaces and resource controls rather than a second operating system.

Compose gives several containers a shared network and lifecycle. Service names become DNS names inside that network, so `booking` can call `flight:8081`; it should not call `localhost:8081`, because `localhost` would point back to the Booking container itself. Published ports such as `8082:8082` are for your laptop, not for container-to-container discovery.

## YAML explainer: one Compose service

```yaml
identity:
  build: { context: ./code/identity, dockerfile: Dockerfile }
  ports: ["8080:8080"]
  environment:
    DATABASE_URL: postgresql://...@identity-db:5432/identity
  depends_on:
    identity-db:
      condition: service_healthy
  read_only: true
```

`build` creates an image; `ports` publishes host-to-container traffic; `environment` configures the process; `depends_on` gates startup on a healthcheck but is not a complete readiness strategy; `read_only` makes accidental writes visible. The application also uses `/tmp` as tmpfs and drops Linux capabilities.

### Read the Compose file as a dependency graph

The ten components are not ten independent processes. Frontend calls the browser-visible API URLs. Booking calls Identity, Flight, and Notification and writes to Booking PostgreSQL. Search calls Flight. Notification uses Redis. Each PostgreSQL service owns one database. The `depends_on` conditions express startup dependencies, but they do not turn Compose into a full orchestration system: a dependency can become unavailable after startup, and the application must still handle that failure through timeouts and readiness checks.

The `networks` entry creates a private network from the application's point of view. Service-name DNS is provided by Docker's embedded DNS. There is no Kubernetes Service, EndpointSlice, scheduler, or reconciliation controller here. Compose starts containers from your declared model; it does not continuously replace a deleted container with a new desired replica set in the Kubernetes sense.

### Dockerfile layers and runtime users

A Dockerfile is a build recipe. Each instruction can create an image layer, and the build cache reuses layers whose inputs have not changed. Copying dependency manifests before application source often lets package installation remain cached when only code changes. The final image should contain the runtime artifact, not compilers, credentials, or local build caches.

At runtime, Apollo11 application containers use non-root users, read-only root filesystems, a writable `/tmp` tmpfs, `no-new-privileges`, and dropped capabilities. These controls reduce the impact of a process compromise, but they do not replace dependency patching, authentication, network segmentation, or secret management.

### Environment variables and secret boundaries

Compose substitutes variables before it creates containers. `docker compose config` is useful because it shows the resolved model, but be careful: it can print passwords and tokens. The committed `.env.example` documents required names and safe development defaults; `.env` is local state and should not be committed.

The browser is different from the backend. Vite variables baked into the frontend image are public to anyone who downloads the JavaScript bundle. Never put a private database password or signing key into a `VITE_*` variable. Backend environment variables are not automatically safe either; they can appear in process inspection, crash dumps, or debug output.

## Inspect

```bash
docker compose config
docker network inspect launchpad_apollo-airlines
docker compose logs -f booking
docker compose exec booking getent hosts flight identity notification
curl --fail http://localhost:8080/readyz
curl --fail http://localhost:8081/metrics | head
```

`healthz` means “the process is alive.” `readyz` means “this process can serve its dependency-aware workload.” A container can be running while it is not ready.

### What each inspection proves

`docker compose config` proves interpolation and merge results, not application behavior. `docker compose ps` proves container state and healthcheck status, not that a request follows the intended dependency path. `docker network inspect` proves which containers share a network and which aliases exist. `docker compose exec ... getent hosts` proves service-name resolution from the caller's network namespace. `curl` proves one endpoint at one moment. Logs explain process decisions but can be incomplete if the process is killed abruptly.

```bash
docker compose ps
docker inspect "$(docker compose ps -q booking)" --format '{{json .State.Health}}'
docker compose exec booking sh -c 'wget -qO- http://flight:8081/readyz'
docker compose exec booking sh -c 'wget -qO- http://identity:8080/readyz'
docker compose logs --tail=50 --timestamps booking
```

If the in-network calls work but the browser fails, the issue is likely host publishing, frontend configuration, CORS, or browser-side URL resolution—not service discovery between containers.

## Break and recover

```bash
docker compose stop flight-db
curl -i http://localhost:8081/readyz
curl -i http://localhost:8083/readyz
curl -i http://localhost:8082/readyz
docker compose start flight-db
docker compose ps
curl --retry 10 --retry-all-errors --fail http://localhost:8081/readyz
```

Search and Booking should expose the dependency failure through readiness, then recover. Test persistence by inspecting seeded data, restarting a database container, and checking the data again. `docker compose down` preserves named volumes; `docker compose down -v` removes them and is destructive.

The important distinction is between failure propagation and failure recovery. A good readiness implementation withdraws a service from dependent traffic while the dependency is unavailable. A good client uses bounded timeouts instead of hanging forever. A good recovery check confirms the dependency returns, readiness turns green, and an actual request succeeds again. “The container restarted” is not enough.

## Gotchas

- Compose service names resolve inside the Compose network; `localhost` inside a container means that same container.
- Published ports are host access, not service discovery.
- A read-only filesystem needs an explicit writable tmpfs for programs that use `/tmp`.
- PostgreSQL init scripts run only when the data directory is empty.
- Dozzle requires Docker socket access; leave its profile off unless you understand that privilege.

## A guided request trace

Use the browser to log in or search for a flight, then watch the services in separate terminals:

```bash
docker compose logs -f --timestamps frontend
docker compose logs -f --timestamps booking
docker compose logs -f --timestamps identity
docker compose logs -f --timestamps flight
docker compose logs -f --timestamps notification
```

Follow the request ID in the structured logs. The frontend talks to the public host ports because browser JavaScript runs outside the Compose network. Booking then uses service-name DNS because it runs inside the network. This is the first time you see one user action cross multiple network perspectives.

## Docker security fields, one at a time

`user` selects a non-root UID/GID. `read_only` prevents writes to the image filesystem. `tmpfs: /tmp` provides an explicitly disposable writable area. `cap_drop: ALL` removes Linux capabilities that the application does not need. `no-new-privileges:true` prevents a process from gaining additional privileges through setuid or file capabilities. The database containers intentionally have different storage and runtime needs from application containers; security settings should follow the process contract rather than be copied blindly.

These controls are defense in depth. A non-root container can still access every network path available to it, leak secrets it can read, or exploit an application vulnerability. The correct lesson is to reduce blast radius and make assumptions explicit, not to claim a container is “secure” because it runs as UID 1000.

## Break a different boundary: browser versus backend

Stop the frontend only:

```bash
docker compose stop frontend
curl -i http://localhost:3000/healthz
curl --fail http://localhost:8081/readyz
docker compose start frontend
```

The APIs can remain healthy while the browser entry point is unavailable. Now stop Flight and compare direct Flight readiness with Search and Booking readiness. This teaches that component health is not the same as whole-system health, and that dependency graphs should be tested from both edges and nodes.

## Launchpad checkpoint questions

Before leaving, answer these without looking at the file:

1. Why does `booking` call `flight`, but the browser calls `localhost:8081`?
2. What survives a database container restart? What survives `down`? What does `down -v` remove?
3. Why can a container be `Up` while `/readyz` returns an error?
4. Which values are public because they are compiled into the frontend?
5. What evidence proves a service-name lookup works from the Booking network namespace?
6. Why is `depends_on` useful at startup but insufficient for runtime recovery?

## Concepts: health, readiness, and persistence

A healthcheck is a command Docker runs to classify a container. Apollo11 separates `/healthz` (“the process is alive”) from `/readyz` (“the process can serve requests and its required dependencies are usable”). A running container can therefore be unhealthy or unready.

Named volumes outlive containers. PostgreSQL's `/docker-entrypoint-initdb.d/` scripts run only when the database directory is first created; editing the SQL file later does not re-run it against an existing volume. `docker compose down` keeps named volumes, while `docker compose down -v` removes them.

## Checkpoint

Explain image, container, volume, network, `healthcheck`, and `depends_on` in your own words. Then continue to [Ignition](./ignition).
