---
title: Cache-aside
---

# Cache-aside

Cache-aside reads the cache first, uses the authoritative store on a miss, then stores a result subject to expiry and invalidation policy. Define freshness and error behavior explicitly. A cache hit can reduce backend work, but stale data and invalidation are correctness tradeoffs.

## In the Orbital Maneuvering mission

With cache-aside, search checks Redis first. A hit can return a stored result; a
miss fetches from the authoritative flight data, then stores a result according
to expiry and invalidation policy. The cache reduces work for some requests, but
it introduces a freshness decision that the passenger experience must tolerate.

## Evidence and limit

Define the hit, miss, stale, and cache-error branches before relying on the
cache. An X-Cache response header can identify one branch; it does not prove a
faster system or correct freshness under concurrent changes.

## Follow a search request

Cache-aside checks Redis before asking the authoritative flight data. A hit can
return a stored result. A miss reads flight and then stores a result subject to
expiry and invalidation. A cache error needs its own policy: fail the request,
bypass the cache, or serve a bounded stale value.

## Evidence and limits

A hit can reduce backend work while increasing freshness risk. Define the
authoritative source and invalidation rule before calling the cache correct.
