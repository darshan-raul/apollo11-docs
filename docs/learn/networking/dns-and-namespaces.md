---
title: DNS and namespaces
---

# DNS and namespaces

Namespaces scope names and policy boundaries. Cluster DNS commonly expands a short service name using the caller’s namespace search domains. A short name can therefore work in one namespace and fail in another; use the intended fully qualified service name when crossing namespaces. DNS lookup proves a name-to-address answer, not that a backend is ready.

## In the Guidance mission

Names let booking ask for flight without carrying a Pod IP. Kubernetes DNS often
expands a short Service name using the caller’s namespace search domains. That
means `flight` may mean one Service to a caller in the application namespace
and nothing useful to a caller elsewhere. A qualified name states the intended
scope.

## Evidence and limit

A lookup result is evidence that DNS returned an answer. It is not evidence that
the selected Pod is ready, that traffic can reach it, or that an HTTP route
allows the request. Keep name resolution, endpoint eligibility, and application
behaviour as separate checks.
