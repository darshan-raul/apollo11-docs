---
title: Infrastructure and ownership
---

# Infrastructure and ownership

For every component, identify who configures it, who operates it, its failure domain, and its evidence of health. Managed control planes reduce some responsibilities but do not make application availability, IAM design, data recovery, or cost residue disappear.

## In the Lunar Orbit mission

A useful cloud architecture map names the owner of every boundary: provider,
platform team, application team, or managed service. That map makes incidents
and change decisions more concrete. A managed control plane can remove work from
your team while leaving application availability, access design, data recovery,
and financial residue as real responsibilities.

## Evidence and limit

Record the configured service, its status, its failure domain, and the team or
provider contract that operates it. “Managed” is not evidence that a component
meets Apollo’s recovery or availability needs.

## Draw the ownership boundary

A useful cloud map tells Apollo who configures, operates, repairs, and pays for
each component. A managed control plane may remove operational work while
leaving application availability, IAM design, data recovery, and cost residue
with the application team.

## Evidence and limits

Record the provider status and the team contract behind each dependency. Managed
does not mean it meets Apollo’s recovery or availability objective.
