# Source map

Apollo11 is the source of truth for runnable snapshots. This documentation repository was reorganized into concept chapters; source-specific excerpts must be verified against the corresponding Apollo stage before they are marked exact.

| Existing learner page | Core destination | Optional lab/status disposition |
| --- | --- | --- |
| index, Launchpad | start and containers | Launchpad retained |
| Ignition | cluster | Ignition retained |
| Stage 1 | workloads | Stage 1 retained |
| Stage 2 | networking | Stage 2 retained |
| Stage 3 | storage | Stage 3 retained |
| Stage 4 | reliability | Stage 4 retained |
| Stage 5 | delivery | Stage 5 retained |
| Stage 6 | observability | Stage 6 retained |
| Stage 7 | scaling; scheduling moved to reliability | Stage 7 retained |
| EKS, Stages 8–9 | cloud and security | conceptual/status boundary retained |
| Stages 10–11 | later optional material | retained as optional catalogues |
| Capstone | integrated explanation | existing activity remains optional |

Corrections tracked in core chapters: EndpointSlice is control information rather than a packet hop; Gateway attachment and backend permissions are distinct; probe budget covers startup; preStop is inside grace period; pressure is not an absolute QoS ladder; StatefulSet and PVC persistence have limits; HPA stabilization uses recommendation history; VPA Off is nested under updatePolicy; releases/tags and rollback have boundaries; ServiceMonitor configures discovery while Prometheus scrapes.


