---
title: Secrets and supply chain
---

# Secrets and supply chain

Secret distribution should minimize readers, avoid logs, and support rotation. Image provenance and admission controls can reduce which artifacts are accepted, but a tag alone is not immutable provenance. Rotation needs an application reload or restart plan and evidence that old credentials no longer work.

## In the Command Module

Sensitive values need a distribution, reader, rotation, and application-reload
story. Supply-chain controls likewise connect a source, built artifact, digest,
and admission decision. An image tag can be moved; a digest identifies specific
content. Neither fact alone says who may pull it or whether its credentials have
been exposed.

## Evidence and limit

Verify who can read a Secret, how a workload receives it, and how old values stop
working after rotation. Verify provenance claims with the actual artifact and
policy evidence rather than the appearance of a version tag.

## Give sensitive values a lifecycle

A credential needs an owner, a reader set, a delivery path, a rotation plan, and
a way for the application to adopt the new value. An artifact needs a source
revision, build record, content identity, and an admission decision. A movable
tag is not an immutable digest.

## Evidence and limits

Verify who can read a Secret and when an old credential stops working. Verify
artifact provenance from the registry and policy evidence rather than its label.
