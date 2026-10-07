---
title: "Volume lifetimes"
description: "Which failure each kind of storage survives, and what 'persistent' means on kind."
---

# Volume lifetimes

*Stage 3 · Mission Data*

**You will be able to:** name the failure boundary a volume crosses instead of calling it "persistent".

## Survival table

| Storage | Container restart | Pod deleted | Node lost | Cluster lost |
|---|---|---|---|---|
| Process memory | ❌ | ❌ | ❌ | ❌ |
| Container writable layer | ✅ | ❌ | ❌ | ❌ |
| `emptyDir` | ✅ | ❌ | ❌ | ❌ |
| `hostPath` | ✅ | ✅ same node | ❌ | ❌ |
| PVC, `local-path` (kind) | ✅ | ✅ | ❌ | ❌ |
| PVC, cloud block disk | ✅ | ✅ | ✅ same zone | ❌ |
| Managed DB, multi-AZ | ✅ | ✅ | ✅ | ✅ within region |

- Stage 1 lost all DB rows because Postgres wrote to an `emptyDir`.

## `emptyDir`

| Good for | Bad for |
|---|---|
| Scratch space, `medium: Memory` tmpfs, sharing files between init and app containers | Database data dirs, uploads that cannot be re-fetched, anything needed after a rollout |

## `local-path` on kind

- **Solves:** the PVC survives Pod replacement; the new Pod remounts the same directory.
- **Does not solve:** the directory lives in `/var/local-path-provisioner/` inside **one** node container. Lose the node, lose the data. It also pins the Pod to that node.

## Try it

```bash
kubectl get pvc -n apollo-airlines-apps
kubectl get sc
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='{.spec.hostPath.path}{"\n"}'
```

## Check yourself

<details>
<summary>Which storage in the table survives Pod deletion but not node loss?</summary>

`hostPath` (same node) and kind's `local-path` PVC.
</details>

<details>
<summary>Why is <code>emptyDir</code> wrong for a Postgres data directory?</summary>

Its lifetime is the Pod's. A replacement Pod starts with an empty data directory.
</details>
