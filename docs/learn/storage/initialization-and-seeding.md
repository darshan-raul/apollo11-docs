---
title: Initialization and seeding
---

# Initialization and seeding

Schema bootstrap creates required structure. A seed Job adds known data. A migration transforms existing data. These need different ownership and retry rules. Make every repeatable operation idempotent, record its version, and do not treat a completed Job as proof that an application’s full data contract is sound.

## In the Mission Data story

Creating a schema, adding known development data, and migrating existing records
look similar because all touch a database. They are different kinds of work.
Bootstrap creates required structure, seed work adds predictable records, and a
migration transforms existing state. Each needs a rerun policy that fits its
purpose.

## Evidence and limit

A completed seed Job is evidence for that job execution. It does not say a
migration was safe or that existing production data is valid. Record versions and
make repeatable actions idempotent before relying on retries.
