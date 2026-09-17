---
title: "Cache-aside"
description: "Understand how the cache-aside pattern works, what each branch in the decision tree requires, and why freshness and error handling must be designed explicitly."
---

# Cache-aside

*Stage 7 · Orbital Maneuvering*

Apollo's search service queries flight schedules repeatedly. Because flight timetables change infrequently, repeatedly querying PostgreSQL wastes database CPU and saturates connection pools.

The **cache-aside** pattern introduces an in-memory key-value store (Redis) to absorb repetitive read traffic.

---

## Decision tree: the 4 cache-aside branches

~~~mermaid
flowchart TD
  Request["Search request:\nJFK→LHR, 2024-10-01"] --> CacheCheck{"Redis: EXIST\nroute:JFK:LHR:2024-10-01"}
  CacheCheck -->|HIT| CacheReturn["Return cached result\n(< 5ms)"]
  CacheCheck -->|MISS| FlightDB["Query flight database\n(~200ms)"]
  FlightDB -->|Success| Store["SET route:... result EX 300\nReturn result"]
  FlightDB -->|Error| ErrorPolicy{"Error policy"}
  ErrorPolicy -->|Fail open| Stale["Return stale cached value\n(if available)"]
  ErrorPolicy -->|Fail closed| HTTP503["Return 503 to passenger"]
  CacheCheck -->|CACHE ERROR| CacheErrorPolicy{"Redis unreachable\nError policy"}
  CacheErrorPolicy -->|Bypass| FlightDB
  CacheErrorPolicy -->|Fail closed| HTTP503
~~~

*Diagram SC-02 — the four observable branches of cache-aside: Cache Hit, Cache Miss, Database Error, and Cache Outage.*

- **Branch 1: Cache Hit**:
  - Key exists in Redis. Returns response immediately (&lt;5ms). Database is never queried.
- **Branch 2: Cache Miss**:
  - Key absent. Reads from PostgreSQL, writes result to Redis with a TTL (e.g. `EX 300`), and returns response.
- **Branch 3: Database Failure on Miss**:
  - If the database query times out, decide whether to serve stale data (fail-open) or return HTTP 503 (fail-closed).
- **Branch 4: Cache Outage (Cache Stampede Hazard)**:
  - If Redis crashes, bypassing the cache directs 100% of read queries directly onto PostgreSQL, potentially collapsing the database under a stampede.

---

## TTL policies by data volatility

- **Static route data (Airport codes, flight numbers)**: Long TTL (24 hours).
- **Flight schedules**: Moderate TTL (5 minutes).
- **Seat inventory & live availability**: Zero cache (query database authoritative locks directly).

---

## Evidence and limits

- **1. Redis hit/miss ratio**:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/redis -- \
    redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"
  ```
- **2. Verify key TTL expiration**:
  ```bash
  kubectl exec -n apollo-airlines-apps deploy/redis -- \
    redis-cli TTL "route:JFK:LHR:2024-10-01"
  ```
- **3. Header verification**: Confirm response headers indicate cache state:
  ```bash
  curl -v http://localhost:30083/api/search?departure=JFK&arrival=LHR 2>&1 | grep -i "x-cache"
  ```
