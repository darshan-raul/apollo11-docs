---
title: Jobs and initialization
---

# Jobs and initialization

A Job represents finite work that should reach successful completion, such as a repeatable seed task. It differs from a Deployment, which maintains a continuing replica count. Initialization, seed work, and schema migrations need explicit idempotency: retries and re-runs are normal in distributed systems. Success evidence is a completed Job plus the intended, safely inspectable data outcome.

## In the Liftoff mission

Not every piece of Apollo should run forever. A database seed or carefully
designed migration is finite work, which is the job of a Job. A Deployment keeps
a target number of long-running Pods alive; a Job keeps retrying until its work
succeeds according to its policy. Conflating them can turn completed work into a
service that restarts forever.

## Evidence and limit

A completed Job and its logs show that its process reported success. They do not
automatically prove that a rerun is safe. Seed work and migrations must be
idempotent or versioned, because retries and operator reruns are normal.
