---
title: Identity and authorization
---

# Identity and authorization

Authentication answers who made a request. Authorization decides whether that identity may perform an action. Admission runs after authentication and authorization to validate or mutate accepted requests. A ServiceAccount is a workload identity, not proof that it has least privilege. Apollo security labs remain planned; these examples are conceptual.

## In the Command Module

Authentication establishes which identity made a request. Authorization decides
whether that identity may perform the requested action. Admission then evaluates
an authorised API request before it becomes a stored object. A ServiceAccount is
a workload identity that can be granted narrowly scoped permissions; it is not a
statement that permissions are already minimal.

## Evidence and limit

Use an identity, verb, resource, and namespace when describing an authorization
decision. Passing one Kubernetes API permission test says nothing about network
access, application credentials, or runtime container behaviour.

## Separate the security decisions

Authentication identifies a caller. Authorization decides whether that identity
may perform an action. Admission checks or mutates an API object before it is
stored. A ServiceAccount is a workload identity that may receive permissions;
its existence does not prove those permissions are narrow.

## Evidence and limits

Name the identity, verb, resource, and namespace when explaining an authorization
result. That result says nothing by itself about network access, application
credentials, or runtime container behaviour.
