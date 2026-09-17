---
title: "Promotion and rollback"
description: "Understand what promotion and rollback change in the resource graph, what they cannot undo, and why both operations require the same evidence ladder as a forward release."
---

# Promotion and rollback

*Stage 5 · Payload Integration*

Releasing software across environments requires promoting the exact same container artifact while varying configuration parameters. 

Conversely, rolling back a deployment reverts desired manifest declarations, but cannot reverse runtime side effects.

---

## Promoting immutable artifacts across environments

~~~mermaid
flowchart LR
  Dev["Dev environment\nimage: booking:abc1234\nreplicas: 1\n✅ Passed dev tests"] -->|Promote| Staging
  Staging["Staging environment\nimage: booking:abc1234\nreplicas: 2\n✅ Passed staging tests"] -->|Promote| Prod
  Prod["Production environment\nimage: booking:abc1234\nreplicas: 3\nPDBs enabled"]
~~~

*Diagram DL-06 — promotion carries the identical artifact forward while overlaying environment-specific configurations.*

- **What stays identical**: The container image digest. Do not rebuild images per environment.
- **What varies**: Replica counts, resource allocations, domain hostnames, and ingress TLS certificates.

---

## What rollback modifies vs. what it cannot undo

~~~mermaid
flowchart LR
  V2["Booking v2\nRunning for 15 minutes\nDatabase writes:\n→ new columns populated\nNotifications sent:\n→ 47 booking confirmations"] -->|kubectl rollout undo| V1["Booking v1\nTemplate restored\nBinary: old version\nDatabase: unchanged\nNotifications: already sent"]
~~~

*Diagram DL-07 — the Pod template returns to the previous version; external database mutations and third-party API calls remain in place.*

- **What rollback changes**:
  - Restores previous `spec.template` in the Deployment object.
  - Scales up the previous ReplicaSet.
  - Switches Service endpoints back to the old version.
- **What rollback CANNOT undo**:
  - Database schema mutations or written records.
  - Emails, push notifications, or SMS sent to passengers.
  - External credit card charges and payment authorizations.
  - Messages consumed from asynchronous message brokers.

---

## The Expand-Contract schema migration pattern

To prevent rollbacks from crashing when databases change:
- **1. Expand**: Apply backwards-compatible database migrations (add nullable columns). Both old and new code can read the database.
- **2. Deploy**: Roll out new application version.
- **3. Verify**: Monitor error budgets and traffic health.
- **4. Contract**: Drop legacy fields only after the new version is verified stable.

---

## Evidence and limits

- **1. Active rollout status**:
  ```bash
  kubectl rollout status deployment/booking -n apollo-airlines-apps
  ```
- **2. Live endpoint verification**:
  ```bash
  kubectl get endpoints booking -n apollo-airlines-apps
  ```
- **3. Check release history**:
  ```bash
  helm history apollo-airlines -n apollo-airlines-apps
  ```
- **4. Synthetic HTTP probe**:
  ```bash
  curl -i http://localhost:30082/readyz
  ```
