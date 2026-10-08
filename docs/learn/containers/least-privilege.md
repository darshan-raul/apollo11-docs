---
title: "Least privilege for containers"
description: "Why Apollo's containers run as a non-root user, with a read-only filesystem, no Linux capabilities and no privilege escalation, and what each setting does and does not stop."
---

# Least privilege for containers

*Launchpad · Containers*

**You will be able to:** explain what `USER`, `read_only`, `tmpfs`, `cap_drop: [ALL]` and `no-new-privileges` each take away, and why none of them on its own makes a container safe.

## The problem

A container is an isolated process, not a separate machine ([Process, image, container](./process-image-container)). It shares the host's kernel. If an attacker finds a bug in booking (a bad library, an injection flaw), they get to run code *as booking's process*. What they can do next depends entirely on what that process is allowed to do.

By default that is a lot. Most images run as **root**. The filesystem is writable, so a downloaded tool can be saved and run. The process holds a set of Linux **capabilities**, which are slices of root's power, such as changing file ownership or binding low ports. Defaults are chosen so things work, not so they are safe.

## The idea in plain words

Think of a hotel key card. A guest's card opens their room and the lift. It does not open the kitchen, the safe or the other rooms. If the card is stolen, the thief gets one room, not the building. The hotel didn't make theft impossible; it made theft *cheap to survive*.

Least privilege is the same idea for a process: give it exactly what its job needs, and nothing more. Then a compromise of the process is a small problem instead of a large one.

The analogy stops here. A key card is one thing; a container's privileges are several independent switches, and each closes a different door.

## How it works

Apollo's Compose file sets the same five controls on every application service:

```yaml
# docker-compose.yml (booking, trimmed)
read_only: true                 # the image's files can't be changed
tmpfs:
  - /tmp                        # ...except a small in-memory scratch area
security_opt:
  - no-new-privileges:true      # setuid binaries can't raise privileges
cap_drop:
  - ALL                         # no Linux capabilities at all
```

```dockerfile
# Dockerfile (booking, trimmed)
RUN addgroup -S apollo && adduser -S -G apollo apollo
USER apollo                     # the process runs as a normal user, not root
```

| Control | What it takes away | Attack it blunts | What it does not stop |
|---|---|---|---|
| **Non-root `USER`** | Root inside the container | Writing to system paths; many kernel-exploit paths need root | Bugs in the app itself; reading anything the user can read |
| **`read_only: true`** | Writes to the image's filesystem | Dropping and running a tool; editing the app's own files | Writes to mounted volumes or `tmpfs` |
| **`tmpfs: /tmp`** | — (it *gives* a writable place back) | Keeps apps that need scratch space working; contents vanish on stop | It's still writable, just not persistent |
| **`cap_drop: [ALL]`** | Every capability (chown, raw sockets, binding ports < 1024, …) | Network tricks, ownership changes, many escalation paths | Normal file and network use, which needs no capability |
| **`no-new-privileges`** | Gaining privileges through setuid/setgid programs | "Run `sudo`-like binaries to become root" | Anything the process can already do |

These controls stack. Each one closes a door that the others leave open, which is why they're used together.

Some containers can't take all five:

- **Postgres** starts as root to prepare its data directory, then switches to the `postgres` user on its own. Apollo leaves the database containers less restricted in Launchpad.
- **Dozzle**, the optional log viewer, mounts the Docker socket. Whoever controls that socket can start a privileged container, which amounts to root on the host. That's why it's optional and off by default.

## Apollo example

- [`stages/launchpad/docker-compose.yml`](https://github.com/darshan-raul/Apollo11/blob/69113dcc80f77e32301d8ee7b9e73a67c923de96/stages/launchpad/docker-compose.yml): the five settings on `frontend`, `identity`, `flight`, `booking`, `search` and `notification`.
- `code/<service>/Dockerfile`: each creates an `apollo` user and switches to it with `USER`.

## Try it

```bash
docker compose exec booking id               # uid of apollo, not 0
docker compose exec booking touch /app/x     # Read-only file system
docker compose exec booking touch /tmp/x     # works: tmpfs
```

The first command shows the identity, the second shows the read-only root, and the third shows the one place that is writable.

## Common misconceptions

- **"Containers are isolated, so root inside is harmless."** Root inside shares the host kernel. With a kernel bug or a careless mount, root inside can become root outside.
- **"A read-only filesystem means the app can't write anything."** It can still write to volumes and `tmpfs`. Data belongs in volumes anyway.
- **"Dropping capabilities breaks most apps."** Ordinary web services need none. Apollo runs with `ALL` dropped.
- **"These settings make the container secure."** They make a compromise smaller. They don't fix vulnerable code or leaked secrets.

## Check yourself

<details>
<summary>An attacker gets code execution in booking. Which of the five settings stops them from downloading and running a scanner from `/app`?</summary>

`read_only: true`. They could still write to `/tmp`, which is why `tmpfs` is kept small and why the other controls still matter.
</details>

<details>
<summary>Why is the Docker socket mount the riskiest line in the Compose file, even when it's read-only?</summary>

"Read-only" applies to the socket *file*, not to the API behind it. Anyone who can talk to the Docker API can start a privileged container that mounts the host's filesystem.
</details>

## Where this leads

Kubernetes expresses the same switches in a Pod's `securityContext`: `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities.drop`, `allowPrivilegeEscalation: false` and `seccompProfile`. Stages 1–7 don't set them yet. [Stage 8](../../stage-8) makes them explicit, and [Admission and runtime](../security/admission-and-runtime) explains how a cluster can *require* them.

Launchpad ends with a question Compose cannot answer: who keeps all this running across machines and failures? That is orchestration, and [Ignition](../cluster/why-orchestration) starts with it.
