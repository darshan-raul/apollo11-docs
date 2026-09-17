# Kubernetes documentation review and rebuild prompt

```text
Act as a Kubernetes educator, technical editor, and curriculum architect. Review the documentation in /home/darshan/projects/apollo11-docs and produce a detailed implementation plan to rebuild it as a coherent, progressively deeper learning journey.

Goal and constraints
The documentation must teach learners to understand Kubernetes: why its concepts exist, how its mechanisms work, how the pieces interact, and how that understanding develops across stages.

The current emphasis on investigations and exercises is not a requirement to preserve. Recommend removing, replacing, or moving that material wherever it interrupts learning. The main reading path must teach the concepts fully without requiring learners to solve exercises, run a cluster, or discover explanations themselves. Keep worked examples and annotated demonstrations when they clarify the teaching.

This task is review and planning only. Do not rewrite, delete, or modify repository files, create commits, or push changes. Present the complete review and implementation plan in your response. Do not begin implementation.

Ground the review in the repository
- Read applicable repository instructions, discover the documentation structure, and inspect the actual content of every learner-facing stage, introduction, prerequisite guide, and supporting conceptual page.
- Inspect navigation and relevant examples, manifests, and diagrams to understand the intended reading experience.
- Follow the journey in the order a learner would encounter it. Do not infer teaching quality from filenames, headings, or a few sampled pages.
- Track inspection coverage. Explicitly disclose anything you could not inspect; never claim a complete review if coverage is incomplete.
- Support findings with file paths and section names or line references. Distinguish observed problems from proposed improvements.
- Verify uncertain or version-sensitive Kubernetes claims against official documentation, citing sources where used. Flag anything you cannot verify.
- Give brief progress updates during the review. Resolve routine ambiguities through stated assumptions.

Review lens
Assume a learner who is new to Kubernetes. Infer the intended baseline from the repository and explicitly state which Linux, networking, container, and application concepts must be prerequisites or taught along the way.

Evaluate whether the journey:
- Establishes the problem before introducing the Kubernetes abstraction that addresses it.
- Explains terminology before relying on it.
- Builds accurate mental models before layering on implementation detail.
- Connects declarative configuration to the actual behavior of the system.
- Explains relevant component interactions, lifecycle events, and control flows.
- Introduces concepts in prerequisite order, with clear bridges between stages.
- Revisits earlier concepts with meaningful added depth.
- Explains limitations, tradeoffs, and misconceptions at the appropriate point.
- Uses YAML, commands, diagrams, and examples to support explanations.
- Remains understandable through reading alone.

Look for missing conceptual bridges, premature jargon, unexplained mechanisms, shallow definitions, repetition without progression, excessive setup burden, and places where an investigation substitutes for teaching. Assess the current investigation emphasis independently rather than simply agreeing with my concern.

Required deliverable

1. Overall assessment
Explain what kind of learning experience these docs currently provide, who could successfully follow them, and how far they are from the intended experience. Identify useful material worth preserving and the most consequential structural problems.

2. Stage-by-stage audit
For every existing stage, document:
- What it appears intended to teach.
- What understanding its explanations actually support.
- Prerequisites it assumes and whether those were taught.
- Specific gaps, confusing transitions, and misplaced depth.
- Which content to retain, expand, rewrite, move, merge, or remove, and why.

Include concrete evidence and explain the learner impact. Prioritize findings by how much they obstruct understanding.

3. Proposed learning architecture
Design the best sequence for the intended outcome. Existing stage names, boundaries, and counts are not fixed.

For each proposed stage, specify:
- Purpose and the motivating learner question.
- Entry knowledge.
- Concepts introduced and concepts revisited at greater depth.
- Ordered chapter/page outline with a short teaching brief for each.
- Mechanisms and interactions that require detailed explanation.
- Worked examples and diagrams that would clarify them.
- What the learner must be able to explain afterward.
- How the stage prepares the learner for the next one.

Map prerequisite dependencies and show where each major concept is first introduced, developed, and integrated. Justify the scope; do not turn the curriculum into an exhaustive Kubernetes feature catalog.

4. Writing and teaching standard
Define a practical standard for the rewritten pages: explanatory depth, terminology, narrative flow, diagrams, annotated examples, cross-references, and handling of prerequisites.

Use a flexible pattern such as motivation → mental model → mechanism → worked example → connections and limitations. Adapt it to the topic rather than imposing identical sections everywhere.

Explain how to preserve technical depth while controlling cognitive load. Define what qualifies as a complete explanation and what belongs in optional reference material.

Include one representative before/after teaching example drawn from an actual weak section. Show a short sample of the proposed explanatory style in your response, without modifying the source file.

5. Content migration map
Map every existing learner-facing page to a proposed destination and disposition: retain, expand, rewrite, split, merge, move to optional material, or remove.

For investigations and exercises, distinguish any valuable explanation embedded in them from the activity format. Specify what knowledge must be integrated into the core narrative before the activity can be discarded.

Account for navigation, cross-links, diagrams, examples, and manifests affected by the proposed restructuring.

6. Detailed implementation plan
Provide ordered work packages that another implementation session can execute without having to redesign the curriculum.

For each work package, include:
- Objective and priority.
- Existing files affected and clearly labeled proposed new paths.
- Specific content and structural changes.
- Dependencies and execution order.
- Reusable material and required new material.
- Concrete acceptance criteria.
- Relevant validation steps.

Include the documentation build and link-check commands if you can identify them from the repository; do not invent commands. Address technical correctness, conceptual continuity, terminology consistency, navigation, and readability.

Avoid vague tasks such as “improve explanations.” Specify which explanation is missing, where it belongs, what it must cover, and how completion will be assessed.

7. Completion criteria and remaining decisions
Define how we will determine that the rebuilt docs deliver a detailed, self-contained learning journey. Include checks that the core path works without exercises and that each stage relies only on established prerequisites.

List remaining uncertainties, with recommended defaults. Ask questions only when an unresolved choice would materially change the curriculum.

Done when
The response contains an evidence-backed review, a complete proposed curriculum, a traceable migration map, and an actionable implementation plan. It must be detailed enough to guide a full rewrite, not merely an outline or a list of general recommendations. Stop after delivering the plan.
```

🎯 Target: Codex. 💡 Optimized for a repository-grounded curriculum review that makes conceptual progression and an executable rewrite plan the main deliverables.

This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before pasting. Confirm file paths, directories, and permissions match the actual project.
