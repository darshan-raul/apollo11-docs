• You are Codex working in the documentation repository:

  - Current documentation repo: /home/darshan/projects/apollo11-docs
  - Reference application repository: /home/darshan/projects/Apollo11

  Your task is to comprehensively expand the documentation in the current repository so that a learner can follow it as a
  hands-on journey for learning Kubernetes through the Apollo11 project.

  ## Goal

  Turn the existing documentation into a friendly, thorough, learner-oriented Kubernetes guide grounded in the Apollo11
  application.

  The learner should progressively understand:

  1. What the Apollo11 application does
  2. How its components fit together
  3. Why Kubernetes is useful for running it
  4. Which Kubernetes concepts are involved
  5. How each concept appears in the Apollo11 repository
  6. How to deploy, inspect, troubleshoot, and modify the application
  7. How Kubernetes resources interact at runtime

  The guide should teach Kubernetes concepts at the exact point where they become relevant. Do not assume that the learner
  already understands Kubernetes terminology.

  ## Repository and grounding rules

  1. First inspect the complete structure and existing content of:
     - /home/darshan/projects/apollo11-docs
     - /home/darshan/projects/Apollo11

  2. The Apollo11 repository is the sole source of truth for:
     - Application code
     - Service names
     - Ports
     - Environment variables
     - Container configuration
     - Dockerfiles
     - Kubernetes YAML
     - Helm charts
     - Deployments
     - Services
     - ConfigMaps
     - Secrets
     - Ingress resources
     - Namespaces
     - Persistent storage
     - Health checks
     - Commands specific to this project
     - Repository-specific architecture and behavior

  3. Do not invent Apollo11 files, services, YAML fields, ports, commands, or architecture.

  4. Every code or YAML example MUST come directly from the Apollo11 repository or be a clearly marked, minimal adaptation of
  an existing Apollo11 example.

  5. When showing a repository-specific example, identify its source path, for example:
     `Source: /home/darshan/projects/Apollo11/path/to/file.yaml`

  6. You may explain general Kubernetes concepts using accurate general knowledge, but clearly distinguish:
     - General Kubernetes explanation
     - What Apollo11 specifically does
     - What the learner should observe in the repositories

  7. Do not use external repositories, unrelated examples, or fabricated manifests as references.

  8. Do not add credentials, secrets, tokens, private URLs, or sensitive values to the documentation. Redact them where
  necessary and explain how learners should provide them safely.

  ## Documentation work

  Inspect the existing documentation before editing it. Preserve useful material, but reorganize and rewrite it wherever
  necessary to create a coherent learning path.

  Use the documentation files already present in `/home/darshan/projects/apollo11-docs`. Create new Markdown files only when
  they improve the structure substantially.

  Prefer a progression similar to:

  1. Orientation and learning goals
  2. Prerequisites and local setup
  3. Apollo11 application architecture
  4. Containers and images
  5. Kubernetes fundamentals
  6. Pods and workloads
  7. Deployments and ReplicaSets
  8. Services and networking
  9. Configuration and secrets
  10. Health checks and self-healing
  11. Storage, if Apollo11 uses it
  12. Ingress or external access, if Apollo11 uses it
  13. Namespaces and resource organization
  14. Labels, selectors, and metadata
  15. Resource requests and limits, if present
  16. Observability and troubleshooting
  17. Rolling updates and rollbacks
  18. Scaling and resilience
  19. Reading and modifying Apollo11 manifests
  20. Guided exercises and capstone tasks
  21. Kubernetes glossary and command reference

  Adjust this sequence to match what actually exists in Apollo11. Do not force sections for concepts that are not represented
  in the project. If a useful Kubernetes concept is absent from Apollo11, explain it briefly only when it helps the learner
  understand a nearby concept, and label it as general Kubernetes context.

  ## Teaching style

  Write in detailed, friendly, clear language for a learner who may be new to Kubernetes.

  At every important junction:

  - Explain the concept in plain language
  - Explain why the concept exists
  - Connect it to the Apollo11 application
  - Show the relevant repository file or command
  - Explain the important lines or fields
  - Describe what happens at runtime
  - Give the learner a command or observation task
  - Explain what result they should expect
  - Mention common mistakes and how to diagnose them

  Introduce terminology gradually. Define terms such as Pod, container, Deployment, ReplicaSet, Service, selector, label,
  namespace, ConfigMap, Secret, readiness probe, liveness probe, Ingress, endpoint, rollout, reconciliation, and desired state
  before relying on them.

  Use analogies sparingly and only when they improve understanding. Always follow an analogy with the technically precise
  explanation.

  Do not write as a dry reference manual. Make the guide feel like a guided investigation where the learner discovers how
  Apollo11 works.

  ## Examples and YAML

  For every important YAML example:

  - Include the exact relative path in Apollo11
  - Show only the relevant portion when the file is large
  - Explain the YAML hierarchy and indentation
  - Explain each important field
  - Connect selectors to labels explicitly
  - Explain dependencies between resources
  - Explain what Kubernetes does after applying the resource
  - Include commands to inspect the resulting resource

  Use fenced code blocks with the correct language identifier.

  Never present invented YAML as if it belongs to Apollo11. If a conceptual example is necessary, label it clearly as:

  `Conceptual Kubernetes example — not from Apollo11`

  Prefer Apollo11-grounded examples whenever possible.

  ## Commands and verification

  Only include project-specific commands after verifying them in the repositories.

  For commands that depend on local tooling, explain prerequisites such as:

  - Docker
  - kubectl
  - Minikube, kind, or another cluster tool
  - Helm, if used by Apollo11
  - Required environment variables
  - Required cloud or local services

  Do not assume a particular Kubernetes distribution unless Apollo11 documentation or configuration establishes it. If
  multiple options are possible, explain the tradeoff and select the simplest path supported by the repository.

  For each practical step, include:

  - The command
  - What it does
  - What the learner should see
  - How to tell whether it worked
  - What to check if it fails

  Include useful inspection commands such as logs, describe, get, events, rollout status, and resource discovery only when
  relevant to the actual Apollo11 deployment.

  ## Exercises

  Add progressive exercises throughout the guide. Each exercise should include:

  - Objective
  - Starting point
  - Instructions
  - Expected result
  - Verification command
  - Troubleshooting hints
  - What Kubernetes concept the exercise reinforces

  Include a final capstone exercise that asks the learner to inspect or safely modify an Apollo11 deployment using only
  patterns already present in the repository.

  Do not require learners to invent application code or Kubernetes resources unrelated to Apollo11.

  ## Accuracy and uncertainty

  Before writing repository-specific explanations, verify claims against the actual files.

  If the repository is incomplete, inconsistent, or ambiguous:

  - Do not guess
  - State the uncertainty in the documentation
  - Explain what the learner can verify
  - Preserve the repository’s actual behavior
  - Add a concise note identifying the unresolved point

  Avoid claims such as “this always happens” when the behavior depends on the cluster, image, configuration, or environment.

  ## Navigation and quality

  Improve the documentation’s usability with:

  - A clear landing page
  - A recommended learning sequence
  - Prerequisite checklists
  - Links between related chapters
  - “What you learned” summaries
  - “Before continuing” checkpoints
  - A troubleshooting index
  - A glossary
  - Consistent terminology
  - Consistent heading levels
  - Consistent command formatting
  - Relative links that work from the documentation repository

  At the beginning of the guide, clearly state:

  - Who the guide is for
  - What the learner will build or operate
  - What knowledge is assumed
  - What tools are required
  - How the guide uses Apollo11 as its running example

  ## Scope and approval boundaries

  You may inspect files in both repositories.

  You may edit only files inside:

  `/home/darshan/projects/apollo11-docs`

  Do not modify the Apollo11 application repository.

  Do not delete existing documentation files without first stopping and asking for approval.

  Do not add dependencies, change application code, change Kubernetes manifests, alter CI/CD, or modify infrastructure.

  Do not create Git commits or push changes.

  If the required Apollo11 repository path does not exist, stop and report the exact issue before making documentation
  changes.

  ## Working method

  1. Audit the current documentation structure.
  2. Audit the Apollo11 repository structure and identify all Kubernetes-relevant files.
  3. Build a verified map of application components, manifests, commands, and dependencies.
  4. Propose the documentation information architecture.
  5. Implement the documentation improvements in the current repository.
  6. Check every repository-specific claim and example against Apollo11.
  7. Validate links, headings, code fences, YAML examples, and command consistency.
  8. Review the guide from the perspective of a Kubernetes beginner.
  9. Fix gaps, unexplained terminology, unsupported assumptions, and inconsistent references.
  10. Report the changed files, major learning improvements, verified source paths, and validation performed.

  After each major phase, briefly report:
  `✅ Completed: [summary]`

  ## Done when

  The work is complete only when:

  - The guide provides a coherent beginning-to-end Kubernetes learning journey
  - Concepts are explained before they are used
  - Apollo11 is the running example throughout
  - All repository-specific code, YAML, commands, and architecture claims are verified against `/home/darshan/projects/
  Apollo11`
  - No fabricated Apollo11 details are present
  - Practical exercises include expected results and verification
  - Troubleshooting guidance is included
  - Navigation and cross-links are usable
  - The documentation reads clearly and warmly for learners
  - Only `/home/darshan/projects/apollo11-docs` has been modified
  - No commits or pushes were created
  - You provide a concise changed-file summary and validation report

  This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions
  before pasting. Confirm file paths, directories, and permissions match the actual project.

  🎯 Target: Codex
  💡 Optimized for a repository-grounded documentation expansion that teaches Kubernetes progressively while preventing
  invented Apollo11 code, YAML, commands, or architecture.