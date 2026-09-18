---
title: "Secrets and supply chain"
description: "Understand external secret synchronizers, why tags are insufficient for provenance, and how cryptographic image signing protects the software supply chain."
---

# Secrets and supply chain

*Stage 8 · Command Module (Planned Roadmap)*

:::note[Conceptual chapter]
Vault, External Secrets Operator, signing, and admission enforcement are planned
architecture, not installed parts of the supported Apollo lab. Treat the
commands below as examples of future evidence, not current setup instructions.
:::

Securing application infrastructure requires protecting secrets from exposure and verifying that container images running on worker nodes originated from trusted, tamper-proof build pipelines.

---

## External Secrets Operator (ESO) + HashiCorp Vault

Storing raw Kubernetes Secret YAML files in Git repositories (even private ones) risks credential leakage. Stage 8's planned architecture delegates secret storage to an external KMS:

~~~mermaid
flowchart LR
  Vault["HashiCorp Vault\n(Encrypted secret store)"] -->|Authenticated read| ESO["External Secrets Operator\n(In-cluster controller)"]
  ESO -->|Reconciles| K8sSecret["Kubernetes Secret\n(In-memory API object)"]
  K8sSecret -->|Mounted to| Pod["booking Pod"]
~~~

*Diagram SEC-04 — secrets originate in Vault; External Secrets Operator reconciles them into temporary Kubernetes Secrets.*

- **1. Centralized Authority**: Vault handles access policies, lease times, and secret rotation.
- **2. In-cluster reconciliation**: External Secrets Operator (ESO) reads from Vault and dynamically generates Kubernetes Secrets.
- **3. Automated rotation**: When database passwords rotate in Vault, ESO updates the Kubernetes Secret object automatically.

---

## Supply chain integrity: Cosign and cryptographic digests

Traditional deployment manifests frequently reference mutable tags like `booking:v1.2.0` or `booking:latest`. An attacker compromising a registry can push malicious code over that tag without triggering manifest diffs.

A secure software supply chain establishes two guarantees:

- **1. Content Immutability (Digests)**:
  - Pin images by SHA256 digest (`booking@sha256:4bf92f...`).
  - Guarantees the binary pulled by nodes matches the exact byte sequence compiled by CI.
- **2. Cryptographic Signing (Cosign / Sigstore)**:
  - CI signs the built container image with a private key.
  - Admission controllers (Kyverno) verify the signature against a trusted public key before permitting Pod scheduling.
  - Unsigned or altered images are rejected at admission time.

~~~mermaid
flowchart LR
  Source[Reviewed source revision] --> CI[CI builds image]
  CI --> Digest[Registry stores image by digest]
  CI --> Signature[Signer records signature or attestation]
  Deploy[Deployment references digest] --> Admission[Admission policy]
  Digest --> Admission
  Signature --> Admission
  Admission -->|trusted identity and matching digest| Pod[Pod may be admitted]
  Admission -->|missing or invalid evidence| Reject[Request rejected]
~~~

*Diagram SEC-05 — admission verifies evidence for the referenced image digest;
a familiar tag alone does not establish provenance.*

---

## Evidence and limits

- **1. Audit ExternalSecret sync status**:
  ```bash
  kubectl get externalsecrets -n apollo-airlines-apps
  ```
- **2. Verify container image signature**:
  ```bash
  cosign verify --key cosign.pub apollo11/booking:v1.2.0
  ```
- **3. Audit rejected unsigned images**: Inspect admission controller rejection events:
  ```bash
  kubectl get events -n apollo-airlines-apps | grep -i "signature verification failed"
  ```
