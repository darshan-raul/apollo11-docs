# Writing style guide

Applies to every page under `docs/`. Reviewers: reject a page that breaks these rules.

## Prose rules

- **Structure with bullets and tables; explain in short paragraphs.** Walkthroughs stay bullet-first; chapters teach.
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

## Stage walkthrough template (stage pages)

Stage pages are **walkthroughs, not labs**. There are no exercises, predictions, fault drills or "your turn" tasks. The learner runs the stage from the `Apollo11` repo and reads *what* each step does, *why* it is done that way, and *what it improves over the previous stage*. The YAML lives in the repo; the page points to it and quotes trimmed, commented excerpts.

```md
# Stage N: <Name>
:::info[Page type · stage walkthrough]   (repo folder link at the pinned commit, builds on, concept chapters)
## Where we left off                     (the concrete pains carried from Stage N-1, in Apollo terms)
## What changes in this stage            (table: Concern | Stage N-1 | Stage N | Why it's better)
## What's in the folder                  (table: Path | What it is | New or replaces)
## Walkthrough
### Step K: <action>                     (command; trimmed real excerpt with # comments;
                                          bullets: What happens / Why this way / Compared with Stage N-1)
## When something looks wrong            (table: You see | Likely cause | First command)
## What this stage does not solve yet    (table: Limitation | Why it hurts | Fixed in)
## The journey so far                    (cumulative table; one more column each stage)
## Clean up
## You should now be able to explain     (bullets)
**Next:** …
```

### Walkthrough rules

- Every new object or tool is introduced by the limit of the previous stage that it removes.
- Every step has a **Why this way** bullet; most have a **Compared with** bullet naming the earlier stage.
- Excerpts are copied from the real file at the pinned commit and trimmed; link the full file on GitHub (`/blob/<pin>/…`).
- Showing a behaviour (a deleted Pod returning, a rollout stalling) is fine as **guided observation** with its explanation inline. Don't turn it into a puzzle.
- Keep the journey table's row names consistent across stages.
- Mark anything not verified on a live cluster with `:::caution[Unverified]`.

## Evidence ladder (shared vocabulary)

1. Snapshot (`get -o wide`) → 2. Events → 3. Spec and conditions (`describe`) → 4. Logs → 5. Live endpoint (`curl`, `port-forward`).

## Direction of travel

- Earlier plan docs (`docs-learning-journey-review-prompt.md` and `docs-learning-journey-implementation-plan.md`) are historical.
- Chapters teach the concepts; **stage walkthroughs** show them running, stage by stage, and explain why each stage improves on the last. The earlier exercise/lab format was retired at the course owner's request.
