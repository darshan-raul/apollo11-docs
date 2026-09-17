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


