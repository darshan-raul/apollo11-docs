---
title: "Volume lifetimes"
description: "Which failure each kind of storage survives, and what 'persistent' means on kind."
---

# Volume lifetimes

*Stage 3 · Mission Data*

**You will be able to:** name the failure boundary a volume crosses instead of calling it "persistent", and explain what kind's `local-path` storage does and does not protect.

## The problem

In Stage 1 you watched a database Pod be replaced and come back empty. The Deployment did its job, replacing the Pod, but the data lived inside the Pod's own storage and left with it. We need storage whose lifetime is *not* the Pod's.

"Persistent" is the word everyone reaches for, but it hides the real question: persistent **through what**? A Pod restart? A deleted Pod? A dead node? A lost cluster? Each is a different boundary, and different storage crosses different boundaries.

## The idea in plain words

Picture places to keep a document: your desk (gone when you leave), a locker (stays while you work here), the office filing cabinet (stays if you change desks), a bank vault in another city (survives the building burning down). Nothing is "safe"; each survives certain events.

Kubernetes storage works the same way, so for any data ask: **which event can happen without these bytes disappearing?**

## How it works: the survival table

Read it row by row: choose the storage and see which events it crosses.

| Storage | Container restart | Pod deleted | Node lost | Cluster lost |
|---|---|---|---|---|
| Process memory | ❌ | ❌ | ❌ | ❌ |
| Container writable layer | ✅ | ❌ | ❌ | ❌ |
| `emptyDir` | ✅ | ❌ | ❌ | ❌ |
| `hostPath` | ✅ | ✅ same node | ❌ | ❌ |
| PVC, `local-path` (kind) | ✅ | ✅ | ❌ | ❌ |
| PVC, cloud block disk | ✅ | ✅ | ✅ same zone | ❌ |
| Managed DB, multi-AZ | ✅ | ✅ | ✅ | ✅ within region |

Stage 1 lost its rows because Postgres wrote to an `emptyDir`: a scratch folder tied to the Pod's lifetime. It is the right tool for temporary files, in-memory scratch (`medium: Memory`), or sharing files between containers in one Pod, and the wrong tool for a database.

A **PersistentVolumeClaim (PVC)** is how a Pod asks for storage whose lifetime is separate from the Pod's. The next chapter explains the machinery.

## What `local-path` on kind really is

Apollo's kind cluster uses a storage class called `local-path`. It solves one problem and leaves others open:

- **Solves:** the PVC survives Pod replacement. The new Pod remounts the same directory, so the database files are still there.
- **Does not solve:** the directory is a plain folder inside **one** node container (`/var/local-path-provisioner/…`). Lose that node and the data goes with it. It also *pins* the Pod to that node, because only that node has the folder.

So Stage 3 proves survival across **Pod replacement**, and only that.

## Try it

```bash
kubectl get pvc -n apollo-airlines-apps
kubectl get sc
PV=$(kubectl get pvc pg-data-identity-db-0 -n apollo-airlines-apps -o jsonpath='{.spec.volumeName}')
kubectl get pv $PV -o jsonpath='{.spec.hostPath.path}{"\n"}'
```

- You will see the claim, the storage class, and the real directory on the node.

## Common misconceptions

- **"Bound means backed up."** It means the claim has a volume. Nothing is copied anywhere.
- **"Persistent storage survives anything."** See the table.
- **"`emptyDir` is fine for a database because the Pod restarted fine."** A *restart* keeps it; a *replacement* deletes it.

## Check yourself

<details>
<summary>Which storage survives Pod deletion but not node loss?</summary>

`hostPath` (same node) and kind's `local-path` PVC.
</details>

<details>
<summary>Why is <code>emptyDir</code> wrong for a Postgres data directory?</summary>

Its lifetime is the Pod's. A replacement Pod starts with an empty data directory.
</details>

## Where this leads

Next: how a Pod actually asks for durable storage, and how the cluster supplies it.
