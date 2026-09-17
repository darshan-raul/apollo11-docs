---
title: Claims and provisioning
---

# Claims and provisioning

A PVC is a request for storage; a PV is a volume resource bound to a claim; a StorageClass names provisioning policy. A dynamic provisioner may create a backing volume after a claim. With delayed binding, provisioning or binding waits until scheduling can consider topology. Access modes describe intended mounting semantics, while backend capability and driver behavior determine what is actually possible.

## In the Mission Data story

A PVC asks for storage. A PV represents a volume resource bound to that claim.
A StorageClass names the provisioning policy, and a provisioner can create a
backend volume as a claim is satisfied. With delayed binding, Kubernetes may wait
until scheduling knows where a Pod can run before selecting storage topology.

## Evidence and limit

A Bound PVC is evidence that Kubernetes matched a claim to a volume. Access modes
describe requested mounting semantics, while the actual driver and backend decide
what can be mounted where and how concurrent access behaves.
