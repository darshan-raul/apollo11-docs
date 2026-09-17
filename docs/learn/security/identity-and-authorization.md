---
title: "Identity and authorization"
description: "Understand authentication, authorization, and admission as separate gates, what least-privilege RBAC requires, and why ServiceAccounts are identities rather than security guarantees."
---

# Identity and authorization

*Stage 8 · Command Module (Planned Roadmap)*

When a request arrives at the Kubernetes API server, it is not evaluated by a single monolithic security check. It passes through three sequential security gates: **Authentication**, **Authorization**, and **Admission Control**.

---

## The three API server access gates

~~~mermaid
flowchart LR
  Client["Client Request\n(kubectl / ServiceAccount)"] --> AuthN["1. Authentication\nWho are you?\n(x509 cert, Bearer token)"]
  AuthN --> AuthZ["2. Authorization\nMay you do this?\n(RBAC: Role / ClusterRole)"]
  AuthZ --> Admission["3. Admission\nIs the payload valid?\n(Validating & Mutating Webhooks)"]
  Admission --> etcd["etcd\n(Object committed)"]
~~~

*Diagram SEC-02 — three distinct checkpoints evaluate identity, permission, and object content in sequence.*

- **1. Authentication (AuthN)**:
  - Answers: *Who is making this call?*
  - Mechanisms: X.509 client certificates, OIDC tokens, or ServiceAccount bearer tokens.
- **2. Authorization (AuthZ)**:
  - Answers: *Is this authenticated identity allowed to perform this verb on this resource?*
  - Mechanisms: Role-Based Access Control (RBAC).
- **3. Admission Control**:
  - Answers: *Does the payload adhere to cluster-wide security policies?*
  - Mechanisms: Pod Security Admission, Kyverno, OPA Gatekeeper.

---

## Least-Privilege RBAC architecture

RBAC grants permissions using four core building blocks:

| Scope | Permission Template | Identity Binding |
|---|---|---|
| **Namespaced** | **`Role`** (defines verbs + resources in namespace) | **`RoleBinding`** (attaches Role to ServiceAccount/User) |
| **Cluster-wide** | **`ClusterRole`** (defines cluster-wide permissions) | **`ClusterRoleBinding`** (grants permissions across all namespaces) |

### Anti-patterns to avoid:
- **Binding `cluster-admin` to workloads**: Never bind full administrative rights to applications.
- **Wildcard permissions (`verbs: ["*"]`)**: Always name explicit verbs (`["get", "list", "watch"]`).
- **Default ServiceAccount reuse**: Each service must have its own isolated ServiceAccount so access can be granted or revoked independently.

---

## Evidence and limits

- **1. Test authorization rules (`kubectl auth can-i`)**:
  ```bash
  kubectl auth can-i create pods --as=system:serviceaccount:apollo-airlines-apps:booking -n apollo-airlines-apps
  ```
- **2. Inspect assigned RoleBindings**:
  ```bash
  kubectl get rolebindings,clusterrolebindings -n apollo-airlines-apps -o wide
  ```
- **3. Audit ServiceAccount permissions**:
  ```bash
  kubectl describe rolebinding <binding-name> -n apollo-airlines-apps
  ```
