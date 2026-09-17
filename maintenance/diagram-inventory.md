# Diagram inventory

Diagram IDs identify a teaching question, not an API object as an active actor. The initial implementation includes the high-risk conceptual diagrams below; remaining planned diagrams are explicitly backlog rather than claimed complete.

| ID | Destination | Teaching question | Status |
| --- | --- | --- | --- |
| OR-00 | index | What is the dependency order? | retired; replaced by the mission/question table in the Flight Plan |
| OR-01–02 | orientation | How do reading and Apollo’s booking flow fit? | complete |
| CT-01–04 | containers | What runs, where does it run, and what survives? | complete |
| CL-01–04 | cluster | How does desired state become a Pod? | complete |
| WL-01–03 | workloads | What differs between ownership, selection, readiness, and rollout? | complete |
| NW-01 | networking | What are Service control and packet paths? | complete |
| RL-01 | reliability | What does each probe cause? | complete |
| NW-02–09 | networking | DNS, NodePort, Ingress, TLS, MetalLB, Gateway | backlog |
| ST-01–07 | storage | lifetimes, binding, identity, recovery | backlog |
| RL-02–08 | reliability | draining, pressure, placement, disruption | backlog |
| DL-01–06 | delivery | render, transform, CI, GitOps, promotion | backlog |
| OB-01–07 | observability | signals, scrape, query, logs, traces | backlog |
| SC-01–06 | scaling | measurement, cache, HPA, VPA | backlog |
| SE-01–05 | security | identity, admission, policy, supply chain | backlog |
| CO-01–05 | cloud | ownership, topology, restore | backlog |
| CA-01 | learn/capstone/a-booking-through-kubernetes | How does one booking connect the mission stages? | authored; rendered review pending |
| CA-02–03 | capstone | failure/recovery and demonstrated boundaries | backlog |
| OP-01–02 | optional | mission prerequisites | backlog |
| TR-01–04 | troubleshooting | diagnosis paths | backlog |

Owner: documentation maintainers. Source basis: Kubernetes upstream concepts and the named Apollo stage where an Apollo-specific assertion is made. Review each complete diagram in light/dark themes and narrow viewport before changing its status.

