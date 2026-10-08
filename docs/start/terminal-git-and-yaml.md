---
title: "Terminal, Git, and YAML Essentials"
sidebar_label: "Terminal, Git & YAML"
description: "Minimum shell, Git and YAML needed for the walkthroughs."
---

# Terminal, Git, and YAML essentials

**You will be able to:** read any command in the walkthroughs before running it, and read a manifest in four passes.

## Shell

| Syntax | Meaning |
|---|---|
| `cmd --flag value` | Option with value |
| `a \| b` | Pipe `a`'s output into `b` |
| `a && b` | Run `b` only if `a` succeeded |
| `> file` | Overwrite `file` (destructive) |
| `<name>` | Placeholder. Replace it, brackets included |
| `Ctrl+C` | Stop a foreground watch or port-forward |

- `pwd` shows where you are; relative paths start there.
- Check cluster, namespace and directory before any command that changes things.

## Git (only these)

```bash
git status --short      # empty = clean
git rev-parse HEAD      # exact commit
```

- Use a dedicated clone. Pinned commit: see [setup](../labs/setup#prepare-the-verified-workspace).

## YAML

- Indentation = nesting. Spaces only, never tabs.
- `key: value` is a mapping. `- item` is a list entry.

```yaml
apiVersion: v1          # 1. what type
kind: Pod
metadata:               # 2. name, namespace, labels
  name: booking
  labels:
    app: booking
spec:                   # 3. desired state
  containers:           #    list
    - name: booking
      image: example/booking:1.0
      ports:
        - containerPort: 8082
```

Four passes over any manifest:

1. `apiVersion` + `kind`: which object?
2. `metadata`: name, namespace, labels.
3. `spec`: desired state.
4. References: which names and labels must match exactly (selectors, `secretKeyRef`, `serviceName`)?

## Gotchas

- Key order does not mean execution order.
- A valid manifest can still point at a missing name.
- `kubectl apply` succeeding means the API **accepted** it. Nothing more.

## Check yourself

<details>
<summary><code>containers:</code> is followed by two lines starting <code>- name:</code>. What is that?</summary>

A list of two container definitions.
</details>

<details>
<summary>Does a successful <code>kubectl apply</code> prove the app works?</summary>

No. Only that the API accepted the object. Controllers, scheduling and the request path still need checking.
</details>

Next: [Meet Apollo Airlines](./apollo-airlines).
