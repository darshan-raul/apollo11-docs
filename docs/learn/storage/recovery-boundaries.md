---
title: "Recovery boundaries"
description: "Understand what a surviving PVC actually proves, how reclaim policy affects what happens when a claim is released, and why a backup is not the same as a recovery."
---

# Recovery boundaries

*Stage 3 · Mission Data*

Observing a PVC survive a Pod restart is valuable evidence, but it only validates a single failure boundary. It does not prove the data can survive node hardware destruction, human errors, or cluster outages.

---

## PV reclaim policy: what happens when claims are deleted

When a PVC is deleted, the underlying PersistentVolume's **reclaim policy** decides the fate of physical data:

- **`Delete` (Default for dynamic provisioning)**:
  - Deleting the PVC immediately triggers the provisioner to permanently wipe and destroy the backing storage volume.
  - Practical in ephemeral test environments; dangerous in production.
- **`Retain`**:
  - The PV transitions to `Released` status.
  - The underlying disk remains intact, preventing accidental data destruction.
  - Requires manual administrative intervention to scrub or rebind.

~~~mermaid
stateDiagram-v2
  [*] --> Available: Provisioner creates PV
  Available --> Bound: PVC claims PV
  Bound --> Released: PVC deleted (Retain policy)
  Bound --> [*]: PVC deleted (Delete policy) — data gone
  Released --> Available: Admin manually re-binds
  Released --> [*]: Admin deletes PV — data gone
~~~

*Diagram ST-06 — reclaim policy determines whether a backing volume survives PVC deletion; Delete is immediate and irreversible.*

---

## StatefulSet PVC retention policies

Kubernetes allows explicit control over whether PVCs are purged when scaling down:

~~~yaml
spec:
  persistentVolumeClaimRetentionPolicy:
    whenDeleted: Retain   # Retain storage if the StatefulSet object is deleted
    whenScaled: Delete    # Delete volume if replica count is reduced
~~~

---

## Replication vs. Backups

Never conflate real-time replication with backup protection:

- **Replication (High Availability)**:
  - Synchronizes blocks across nodes or zones in real time.
  - Protects against: single node hardware failure, power loss.
  - Fails against: accidental `DROP TABLE`, application data corruption (corruptions replicate instantly).
- **Backups (Disaster Recovery)**:
  - Isolated point-in-time snapshots stored outside the cluster boundary.
  - Protects against: data corruption, ransomware, accidental deletions.
  - *Golden rule*: A backup is not a recovery plan until an automated restore has been rehearsed and verified.

---

## Evidence and limits

- **1. Inspect reclaim policies**:
  ```bash
  kubectl get pv -o custom-columns='NAME:.metadata.name,RECLAIM:.spec.persistentVolumeReclaimPolicy,STATUS:.status.phase'
  ```
- **2. Scale-down behavior test**: Scale StatefulSet to zero and verify PVC retention:
  ```bash
  kubectl scale statefulset identity-db -n apollo-airlines-apps --replicas=0
  kubectl get pvc -n apollo-airlines-apps -l app=identity-db
  ```
- **3. Restore verification**: Verify database readability upon scaling back up:
  ```bash
  kubectl scale statefulset identity-db -n apollo-airlines-apps --replicas=1
  kubectl wait --for=condition=Ready pod/identity-db-0 -n apollo-airlines-apps --timeout=60s
  kubectl exec -n apollo-airlines-apps statefulset/identity-db -- \
    psql -U postgres -d identity -c "SELECT count(*) FROM users;"
  ```
