# Diagram inventory

Diagram IDs identify a teaching question, not an API object as an active actor.
`Authored` means the diagram exists in a learner-facing page and passes the
Docusaurus production build. It does not replace a light-theme, dark-theme, and
narrow-viewport visual review.

## Authored diagrams

| IDs | Destination | Teaching purpose | Status |
| --- | --- | --- | --- |
| OR-01–02 | orientation | Reading workflow and the simplified passenger request | authored; build verified |
| CT-01–04 | containers | Process/image/container, runtime inputs, network location, and readiness | authored; build verified |
| CL-01–04 | cluster | Reconciliation, API objects, component hand-offs, and Pod replacement | authored; build verified |
| WL-01–07 | workloads | Ownership, selection, rollout, configuration, Jobs, state, and Service readiness | authored; build verified |
| NW-00–01 | networking | Pod networking and separate Service control/traffic paths | authored; build verified |
| NW-04–08 | networking | DNS, host-to-NodePort routing, Ingress, TLS boundaries, and LoadBalancer allocation | authored; build verified |
| NW-09–13 | networking | Gateway reconciliation, listener and Route matching, request path, permissions, and Ingress migration | authored; build verified |
| ST-01–06 | storage | Lifetimes, binding, stable identity, per-ordinal claims, initialization, and reclaim policy | authored; build verified |
| RL-01–08 | reliability | Probe actions and budgets, resources, placement, termination, disruption arithmetic, and pressure | authored; build verified |
| DL-01–03, DL-05–07 | delivery | Helm, Kustomize, GitOps, CI hand-offs, promotion, and rollback | authored; build verified |
| OB-01–07 | observability | Signal choice, collection, trace pipeline, logs, objectives, and correlation | authored; build verified |
| SC-01–06 | scaling | Baselines, cache-aside, HPA, stabilization, VPA, and capacity | authored; build verified |
| SEC-01–05 | security | Admission/runtime, API access, network policy, secret delivery, and image admission | authored; build verified; conceptual mission |
| CLD-01–05 | cloud | Provider implementation, ownership, topology, restore, and teardown | authored; build verified; conceptual mission |
| CA-01–02 | capstone | Integrated booking path and interrupted-request recovery | authored; build verified |
| TR-01–04 | troubleshooting | Pod, network, storage, and autoscaling diagnosis paths | authored; build verified |

There are **78 authored diagrams** in the ranges above. OR-01, OR-02, and CT-01
use an inline caption style; the other 75 use the `*Diagram ID` caption form.

## Deliberately retired or superseded IDs

These IDs are not missing work. Their proposed teaching question is already
answered by another diagram or no longer warrants a separate visual.

| ID | Original purpose | Disposition |
| --- | --- | --- |
| OR-00 | Whole-course dependency graph | retired; the Flight Plan mission/question table is easier to scan |
| NW-02–03 | Service selection and readiness | superseded by WL-07 and NW-01 |
| ST-07 | General recovery boundary | superseded by ST-06 and CLD-04 |
| DL-04 | Controller ownership during delivery | superseded by DL-03 and DL-06 |
| CA-03 | Demonstrated versus unproven boundaries | retained as capstone prose; a third overview duplicated CA-01 |

## Remaining diagram backlog

None. Every diagram previously listed in the backlog now has a learner-facing
Mermaid source, interpretation caption, and destination page.

The former `OP-01–02` optional-mission diagrams are removed from the backlog.
The optional catalogues do not yet contain enough teaching content to justify
visuals; diagrams should be proposed only when those pages become lessons.

## Review checklist

Before changing an authored diagram to visually reviewed:

1. Render it in both light and dark themes.
2. Check labels at a narrow documentation viewport.
3. Confirm control/configuration, application traffic, and telemetry edges are
   visually distinguishable where more than one appears.
4. Confirm no API object is shown performing work that belongs to a controller,
   kubelet, proxy, application, or provider integration.
5. Verify Apollo-specific names and relationships against the named source
   snapshot.

Owner: documentation maintainers. Source basis: Kubernetes upstream concepts
and the named Apollo stage where an Apollo-specific assertion is made.
