---
title: Admission and runtime controls
---

# Admission and runtime controls

Admission policies inspect objects before persistence. Runtime controls constrain what a container may do after it starts: user identity, capabilities, filesystem permissions, and seccomp are different controls. A compliant manifest does not prove an application has no vulnerable behavior.

## In the Command Module

Admission policies inspect or change objects before persistence. Runtime controls
constrain a container after startup: the user it runs as, granted capabilities,
filesystem behaviour, and syscall profile solve different problems. A manifest
that passes admission is still only a desired configuration; its running image
and application behaviour deserve separate scrutiny.

## Evidence and limit

Check policy decisions and the resulting Pod security context. Do not infer that
an accepted object is vulnerability-free or that its process cannot misuse an
authorised credential.

## Before and after startup

Admission policies inspect an object before persistence. Runtime controls apply
after a container starts: user identity, Linux capabilities, filesystem
permissions, and syscall profiles solve different problems. A policy-approved
Pod can still run vulnerable application code.

## Evidence and limits

Check the policy decision and the resulting security context separately. Do not
treat a valid manifest as evidence that the process can do no harm.
