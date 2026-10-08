# Writing and exercise style guide

Applies to every page under `docs/`. Reviewers: reject a page that breaks these rules.

## Prose rules

- **Structure with bullets and tables; explain in short paragraphs.** Labs stay terse; chapters teach.
- **No story openers.** Do not open with "Imagine…", "Before a passenger can…", or scene-setting. Open with what the page covers and what the learner can do afterwards.
- **No filler.** Delete sentences that restate the heading, preview later pages, or reassure ("don't worry", "you will already know…").
- **No "Apollo narrative" paragraphs** unless they name a concrete service, object, command or failure.
- **Define a term once**, in a bullet or table row, the first time it is needed. Link afterwards.
- **Prefer tables** for comparisons (A vs B, who does what, what survives what).
- **Prefer a command + expected output** over a paragraph describing it.
- **Diagrams** only when they show a flow the bullets cannot. Keep one per concept.

## Chapter template (teach, then summarise)

Chapters must **groom the learner into the concept**: say why it exists, build a mental model from something already known, then walk through the mechanism. Bullets and tables are for structure; short paragraphs carry the explanation.

```md
# <Concept>
*Stage*
**You will be able to:** <1-2 outcomes>

## The problem                (2-4 sentences: what goes wrong without this; link to the previous chapter)
## The idea in plain words    (mental model or analogy; define each new term the first time)
## How it works               (numbered walkthrough, diagram, table; one new idea per step)
## Apollo example             (exact object/file/command in the repo)
## Try it                     (one command, one expected result, what it proves)
## Common misconceptions      (each: the wrong belief, why it is tempting, the correction)
## Check yourself             (question -> collapsed answer)
## Where this leads           (1-2 sentences bridging to the next chapter)
```

Rules:
- **Define before use.** A term appears in prose with a one-line meaning before it appears in a table or command.
- **Analogy once, then drop it.** Use it to enter the idea, then switch to the precise mechanism and say where the analogy breaks.
- **Why before how.** Every mechanism is introduced by the failure it prevents.
- Target 500-900 words of prose per chapter. Reference tables are in addition.

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

## Direction of travel

- This guide supersedes the earlier "reading-only, remove exercises" direction in `docs-learning-journey-review-prompt.md` and `docs-learning-journey-implementation-plan.md`.
- Chapters stay short and bullet-first; **labs carry the practice**, using the exercise pattern above.
