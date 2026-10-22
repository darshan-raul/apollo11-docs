---
title: "StatefulSets and headless DNS"
description: "Understand stable database member names, replacement Pod identity, and why Apollo has both normal and headless Services."
---

# StatefulSets and headless DNS

*Stage 3 · Mission Data*

**You will be able to:** distinguish a stable member identity from a Pod object and explain the two Service names beside each Apollo database.

## The problem

[Claims and provisioning](./claims-and-provisioning) gives a Pod storage that outlives it. A database workload also needs a predictable association with that storage across replacement, and a predictable network identity.

A Deployment is designed for stateless, interchangeable replicas. It fails stateful database requirements in three ways:

1. **Shared volume templates:** Every replica spawned by a Deployment inherits the exact same `volumes` block. If the template points to a PVC, all replicas attempt to mount that single claim. For a `ReadWriteOnce` volume, replicas on other nodes fail to start with `Multi-Attach` errors. If scheduled on the same node, multiple database processes concurrently writing to the same data directory cause immediate database corruption.
2. **Random Pod names:** Deployment Pods receive random hash suffixes (e.g., `booking-db-69bc87df9b-v4q2x`). A replacement Pod gets a completely different name, making it impossible to identify "member zero".
3. **No stable network identity:** Standard Services load-balance across all endpoints. They provide no mechanism to address a specific database instance (such as a primary for writes or a specific replica for replication streams).

## Stable identity for each member

A **StatefulSet** is a workload controller designed for stateful applications. It provides three guarantees that Deployments do not:

- **Stable member ordinals:** Members are assigned a zero-indexed integer ordinal (`0, 1, ..., N-1`). The Pod names are deterministic: `<statefulset-name>-<ordinal>` (e.g., `identity-db-0`).
- **Dedicated per-member storage:** Combined with claim templates, each ordinal automatically receives and retains its own dedicated PVC (`<template>-<statefulset>-<ordinal>`).
- **Stable network identity:** Paired with a governing headless Service, each member receives a deterministic DNS record that points directly to that specific member's IP address.

| Property | Deployment | StatefulSet in Apollo |
|---|---|---|
| Member naming | Generated random hash suffix | Workload name plus ordinal index (`identity-db-0`) |
| Replacement Pod UID | Brand-new UID | Brand-new UID (same member name, new Pod object) |
| Storage references | Shared template references | Dedicated PVC generated per ordinal index |
| Network addressing | Virtual ClusterIP load-balancing across replicas | Direct per-member DNS names via headless Service |
| Typical workload | Stateless HTTP services (`booking`, `flight`) | Stateful databases and stores (`identity-db`, `redis`) |

## How it works

A stable member name must resolve to the member's current Pod IP. A standard Service cannot do this because it allocates a virtual ClusterIP and relies on kube-proxy packet rewriting (iptables/IPVS) to distribute traffic across endpoints.

A **headless Service** is created by setting `spec.clusterIP: None`. It disables virtual IP allocation and kube-proxy packet routing. Instead, CoreDNS returns DNS A/AAAA records containing the actual IP addresses of the matching ready Pods directly.

Apollo's [identity StatefulSet](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-sts.yaml) defines its governing Service in `serviceName`:

```yaml
# Excerpt from identity-db-sts.yaml
spec:
  serviceName: identity-db-headless
  replicas: 1
```

The matching [headless Service](https://github.com/darshan-raul/Apollo11/blob/f6211e679f8ed66a5a19033ac49a3bfc3a506eab/stages/stage3/k8s/apps/identity-db/identity-db-svc-headless.yaml) selects that Pod:

```yaml
# Excerpt from identity-db-svc-headless.yaml
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: identity-db
  ports:
    - port: 5432
      targetPort: 5432
```

When a StatefulSet specifies `serviceName`, CoreDNS creates an A record for the Service and a dedicated A record for each individual Pod:

```text
identity-db-0.identity-db-headless.apollo-airlines-apps.svc.cluster.local
│             │                    │                       │
Pod name      governing Service    namespace               cluster domain
```

Within the `apollo-airlines-apps` namespace, the short name `identity-db-0.identity-db-headless` resolves directly to member zero's current Pod IP.

CoreDNS publishes addresses only for ready Pods by default. If `identity-db-0` is starting up or fails its readiness probe, the DNS name will temporarily return no records. A stable DNS name does not keep TCP connections alive: if a Pod is replaced, clients must reconnect to the new IP address.

## Apollo example: why two Services?

Each database in Apollo is accompanied by two Services targeting the exact same Pod:

| Name | Service Type | Resolves to | Used for |
|---|---|---|---|
| `identity-db` | Ordinary ClusterIP | Virtual ClusterIP (`10.96.x.x`) | The `identity` service application connection string |
| `identity-db-headless` | Headless (`clusterIP: None`) | Pod IP list (`10.244.x.x`) | Endpoint discovery and StatefulSet governing contract |
| `identity-db-0.identity-db-headless` | Per-pod record | Member zero's Pod IP (`10.244.x.x`) | Direct access to that specific member |

The same pattern applies to `flight-db`, `booking-db`, and `redis`. Apollo application microservices continue connecting to the ordinary ClusterIP Service (`DATABASE_URL=postgres://...@identity-db:5432/identity`). They do not need to know the database ordinal. The headless Service satisfies the StatefulSet requirement and provides the addressing foundation for multi-member clusters.

Scaling `replicas: 2` on Apollo's StatefulSet does not create a PostgreSQL primary-replica cluster. The controller would launch `identity-db-1` with a separate, blank volume. Both databases would receive writes independently through the ordinary Service, corrupting data consistency. Database clustering requires database-aware clustering tools or operators (such as CloudNativePG or Patroni).

## Try it

After installing Stage 3, compare how the two Services resolve from inside the `identity` application container:

```bash
kubectl exec -n apollo-airlines-apps deploy/identity -- getent hosts identity-db
kubectl exec -n apollo-airlines-apps deploy/identity -- \
  getent hosts identity-db-0.identity-db-headless
kubectl get svc identity-db -n apollo-airlines-apps
kubectl get pod identity-db-0 -n apollo-airlines-apps -o wide
```

Expected:
- The first lookup (`identity-db`) returns the virtual `CLUSTER-IP` of the standard Service.
- The second lookup (`identity-db-0.identity-db-headless`) returns the Pod's direct IP (`10.244.x.x`), matching the `IP` column of `identity-db-0`.

This proves that Apollo provides both a stable virtual Service IP for application clients and a direct DNS path to the individual stateful Pod.


## Common misconceptions

- **“The same name means the same Pod.”** Names can be reused; UIDs identify individual Pod objects.
- **“Headless means no Service.”** The Service still supplies endpoint discovery, but has no virtual IP.
- **“A stable name proves data survived.”** It proves identity. Read a record from the database to prove data survival.

## Check yourself

<details>
<summary>Why do the applications continue connecting to identity-db?</summary>

The ordinary Service already supplies a stable client address. Per-member names are useful when a caller must select a specific member; Apollo's single-member database clients do not need that selection.

</details>

<details>
<summary>Does replicas: 2 make the databases copies of each other?</summary>

No. It creates two members with independent storage. Replication, primary selection, and client routing need database-aware configuration or an operator.

</details>

## Where this leads

[StatefulSet storage and operations](./statefulset-storage-and-operations) follows the claim association through replacement, updates, and deletion.

## References

- [StatefulSet identity](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#pod-identity)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
