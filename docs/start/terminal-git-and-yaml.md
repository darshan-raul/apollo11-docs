---
title: "Terminal, Git, and YAML Essentials"
sidebar_label: "Terminal, Git & YAML"
description: "The minimum shell, Git, and YAML knowledge needed to follow Apollo11 labs safely."
---

# Terminal, Git, and YAML essentials

This primer supplies the small amount of syntax that later chapters rely on.
You may skim it now and return when a command or manifest feels unfamiliar.

## Read a shell command before running it

The prompt is not part of a command. Run commands from the directory named by
the lab. A relative path such as `stages/stage1` starts at your current working
directory; `pwd` prints that directory and `ls` lists its contents.

Shell symbols change behaviour:

| Syntax | Meaning |
| --- | --- |
| `command --flag value` | Run a program with an option and its value. |
| `a | b` | Send `a`'s output to `b`. |
| `a && b` | Run `b` only if `a` succeeds. |
| `> file` | Replace a file with command output. Treat this as destructive. |
| `<name>` | A placeholder in these docs; replace it, including the brackets. |

Stop if a command targets a cluster, namespace, file, or volume you did not
expect. Use `Ctrl+C` to stop a foreground watch or port-forward.

## Record the lab revision with Git

Git identifies an exact repository state with a commit hash. `git status`
shows local changes; `git rev-parse HEAD` prints the current commit. Changing
commits can overwrite local work, so use a clean, dedicated lab clone.

```bash
git status --short
git rev-parse HEAD
```

The [lab compatibility contract](../labs/setup#clone-the-tested-lab-revision)
provides the supported clone and checkout commands.

## Read YAML as nested data

YAML uses indentation to express structure. Spaces matter; tabs should not be
used. A mapping associates keys with values, while a sequence begins each item
with `-`.

```yaml title="A small Pod request"
apiVersion: v1                 # mapping key and scalar value
kind: Pod
metadata:                     # nested mapping
  name: booking
  labels:
    app: booking
spec:
  containers:                 # sequence
    - name: booking
      image: example/booking:1.0
      ports:
        - containerPort: 8082
```

Read a Kubernetes manifest in four passes:

1. `apiVersion` and `kind`: what type of object is requested?
2. `metadata`: what is it called, where does it live, and which labels identify it?
3. `spec`: what desired state is requested?
4. references and selectors: which other names or labels must match exactly?

YAML order usually does not mean execution order. A valid-looking manifest can
still reference a missing name, use an unsupported field, or request something
the cluster cannot provide. API acceptance is only the first evidence rung.

## Check your understanding

<details>
<summary>If <code>containers:</code> is followed by two lines beginning with <code>- name:</code>, what does that represent?</summary>

A sequence containing two container definitions. The dash creates each list
item; indentation shows that both belong to `containers`.
</details>

<details>
<summary>Does a successful <code>kubectl apply</code> prove that the application works?</summary>

No. It proves that the API accepted the request. Controllers must still
converge, Pods must become useful, and the passenger path must be verified.
</details>

Continue to [Meet Apollo Airlines](./apollo-airlines), the application whose
request path will connect every later concept.
