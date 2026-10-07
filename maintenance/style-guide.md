# Writing and exercise style guide

Applies to every page under `docs/`. Reviewers: reject a page that breaks these rules.

## Prose rules

- **Bullets first.** One idea per bullet. Max two sentences per bullet.
- **No story openers.** Do not open with "Imagine…", "Before a passenger can…", or scene-setting. Open with what the page covers and what the learner can do afterwards.
- **No filler.** Delete sentences that restate the heading, preview later pages, or reassure ("don't worry", "you will already know…").
- **No "Apollo narrative" paragraphs** unless they name a concrete service, object, command or failure.
- **Define a term once**, in a bullet or table row, the first time it is needed. Link afterwards.
- **Prefer tables** for comparisons (A vs B, who does what, what survives what).
- **Prefer a command + expected output** over a paragraph describing it.
- **Diagrams** only when they show a flow the bullets cannot. Keep one per concept.
- Page length: chapter ≤ ~400 words of prose excluding code and diagrams.

## Chapter template

```md
# <Concept>

**You will be able to:** <1–2 verbs-first outcomes>

## Key points
- bullets

## How it works          (optional: table or diagram)

## Apollo example
- the exact object/file/command in the Apollo11 repo

## Try it                (3–6 lines; one command, one expected result)

## Gotchas
- bullets: misconceptions and limits

## Check yourself
- Q → collapsed answer
```

## Exercise pattern (labs)

Every lab exercise is a **task with a checkable result**, not a tour of commands. Use this skeleton:

```md
### Exercise N: <verb phrase naming the outcome>

**Goal:** <one line: what you will have proven>
**Time:** ~N min  ·  **Needs:** <state from earlier exercise>

1. **Predict** — write down your answer before running anything.
   - Q1 …
2. **Do** — commands.
3. **Check** — expected output, or the exact field to compare.
4. **Break** (when the exercise has a failure) —
   - Inject: one command.
   - Symptom: what the learner sees.
   - Diagnose: ladder rungs in order; the learner names the failing component *before* opening the reveal.
   - Fix: one command.
   - Prove recovery: observable behaviour (HTTP response, row, rollout status), not "resource exists".
5. **Why** — 2–4 bullets: which component acted, which evidence proves it.
6. **Your turn** — one open task with no commands given (author a manifest, change a value, find the cause); solution in a `<details>` block.
```

### Exercise rules

- Teach a **decision or diagnosis skill**, not a trivia fact. Test: "after this, can the learner tell two similar failures apart?"
- Each Break must produce a **distinct, diagnosable symptom** and name the component that owns the fix.
- Every Break has Recover. Cleanup returns the cluster to the stage baseline.
- Commands copy-paste as written; expected output shown for each check.
- Use `-o jsonpath` / `custom-columns` to compare **one field**, not full YAML dumps.
- Do not teach an exercise whose lesson is only "Kubernetes did the thing automatically".
- Mark anything not verified on a live cluster with `:::caution[Unverified]`.

## Evidence ladder (shared vocabulary)

1. Snapshot (`get -o wide`) → 2. Events → 3. Spec and conditions (`describe`) → 4. Logs → 5. Live endpoint (`curl`, `port-forward`).
