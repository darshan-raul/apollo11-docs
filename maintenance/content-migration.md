# Content migration

| ID | Claim / learner outcome | Destination | Status |
| --- | --- | --- | --- |
| P0-1 | Separate Service configuration from traffic path | learn/networking/service-control-and-data-paths | complete |
| P0-2 | Explain Gateway allowedRoutes and ReferenceGrant separately | learn/networking/gateway-api | complete |
| P0-3 | Correct startup and termination timing | learn/reliability/probes; termination-and-draining | complete |
| P0-4 | Qualify QoS, StatefulSet, HPA, VPA, delivery, and observability claims | relevant core chapters | complete |
| NAV-1 | Reading-first navigation and optional lab boundary | sidebars, homepage, status | complete |
| REF-1 | Retain existing stage URLs | existing stage docs | complete |
| PROV-1 | Maintain source and diagram tracking | maintenance | in progress: source excerpts need per-snapshot audit |

The new core chapters use conceptual prose unless explicitly labeled otherwise. They do not introduce synthetic runnable Apollo manifests.

## Project identity

Apollo’s mission names remain the primary navigation: Launchpad, Ignition,
Liftoff, Guidance, Mission Data, Flight Control, Payload Integration, Mission
Operations, and Orbital Maneuvering. Chapters sit inside those missions, with
the corresponding lab alongside them. Security and cloud retain the Command
Module and Lunar Orbit names and their planned-lab boundaries.

The original six-mission capstone is preserved at `docs/capstone.md`. The reading
walkthrough lives at `docs/learn/capstone/a-booking-through-kubernetes.md` and
links to that lab. Preserve the application story and existing investigations
when expanding the chapters; a shorter summary does not complete their migration.

