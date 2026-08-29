<!--
SYNC IMPACT REPORT
Version change: (none) → 1.0.0
Rationale: Initial ratification of the homemedia-portal project constitution.

Principles defined (all new):
  I.    Product Shape & Scope
  II.   Technology Baseline (v1)
  III.  Compose Isolation
  IV.   Read-Only, Proxied Docker Access
  V.    Explicit Opt-In Discovery
  VI.   Immutable, Manual, Rollback-Capable Deployment
  VII.  Public Registry, No Server Credential
  VIII. No Network or Perimeter Changes
  IX.   Secrets Never Enter the Repository
  X.    Static-Only PWA Caching
  XI.   v1 Capability Fences
  XII.  Evidence & Documentation for Every Change

Sections added:
  - Governance Precedence & Server Authority
  - Development Workflow & Quality Gates
  - Governance

Sections removed: none

Templates reviewed for alignment:
  ✅ .specify/templates/plan-template.md — Constitution Check gate references this file; compatible.
  ✅ .specify/templates/spec-template.md — spec stays product-focused; compatible.
  ✅ .specify/templates/tasks-template.md — no constitution conflicts.

Deferred TODOs: none
-->

# homemedia-portal Constitution

homemedia-portal is a curated, mobile-first internal service directory for a single
private home server. This constitution defines the non-negotiable rules for all
work in this repository. It is binding on every contributor and every automated
agent.

## Core Principles

### I. Product Shape & Scope

The product MUST be a curated, mobile-first internal directory ("menu") of
services running on one private home server. It is reached from outside the home
network ONLY through an existing, separately operated HTTPS reverse proxy; the
portal itself performs no TLS termination and owns no public network edge.

It MUST NOT grow into a general-purpose multi-host dashboard, a monitoring system,
or a management console. Rationale: a tight scope keeps the attack surface small,
the UI fast on a phone, and the operational burden near zero.

### II. Technology Baseline (v1)

v1 MUST be built with SvelteKit, TypeScript, and `@sveltejs/adapter-node`. Simple,
maintainable design MUST be preferred over additional infrastructure: no database,
message queue, or background worker unless a specification proves it is
unavoidable and the plan records the justification. Every new runtime dependency
MUST be justified in the implementation plan. Rationale: one small Node service is
enough for a directory page and is cheap to run, audit, and roll back.

### III. Compose Isolation

The portal MUST run as its own container-compose project, separate from the host's
existing media stack. It MUST NOT change that stack's lifecycle, networking, or
image pins. The ONLY permitted change to existing services is the deliberate
addition of `homemedia.*` service-discovery labels, applied through the server's
documented change process and recorded in the server's operational log. Rationale:
the media stack is deliberately managed; the portal must never be able to disrupt
it.

### IV. Read-Only, Proxied Docker Access

The portal MUST obtain container information ONLY through a digest-pinned Docker
socket proxy that exposes read-only container list/inspect endpoints. The portal
MUST NEVER receive the raw Docker socket, a privileged mount, or any endpoint that
can create, modify, start, stop, or delete containers, images, volumes, or
networks. Rationale: read-only discovery cannot be turned into host compromise.

### V. Explicit Opt-In Discovery

Only containers explicitly labelled `homemedia.enable=true` MUST appear in the
directory. The portal MUST NOT display, enumerate, or hint at unlabelled or
"hidden" services anywhere in its UI or API responses. Rationale: the operator
decides exactly what is shown; nothing leaks by default.

### VI. Immutable, Manual, Rollback-Capable Deployment

Deployed compose definitions MUST reference images by immutable digest. Mutable
tags (e.g. `latest`) MUST NOT appear in deployed compose files. There MUST be no
automatic image updater (e.g. Watchtower). Updates MUST be performed manually
through a documented procedure that records the previous digest and can roll back
to it. Rationale: this matches the host's established operations model and keeps
every change deliberate and reversible.

### VII. Public Registry, No Server Credential

Published container images MUST be hosted on a public registry and MUST be
pullable by the server with no registry login or stored credential. Rationale:
avoids a standing secret on the host and keeps deployment friction low; nothing
secret is ever in the image (see Principle IX).

### VIII. No Network or Perimeter Changes

This project MUST NOT add or modify host firewalls, `ufw`, VPN/WireGuard,
router configuration, or port forwards. The portal binds the server's configured
private-origin address and port only; the reverse proxy runs on separate
infrastructure. Rationale: the home network's perimeter is managed elsewhere and
out of scope here.

### IX. Secrets Never Enter the Repository

No secret or plaintext password MUST EVER be committed to this repository, or
placed in a specification, GitHub issue, commit message, CI log, example file, or
container image. Authentication MUST use an Argon2id password hash supplied at
runtime and a session cookie using the `__Host-` prefix with `Secure`, `HttpOnly`,
and `SameSite` set. Concrete infrastructure values (addresses, hostnames, ports,
service inventory) MUST live only in untracked local files or the server's private
documentation. Rationale: the repository is public and permanent; leaked secrets
and topology cannot be recalled.

### X. Static-Only PWA Caching

The Progressive Web App service worker MUST cache ONLY static build assets (scripts,
styles, fonts, icons). It MUST NEVER cache service data, API responses,
authentication routes, or authenticated HTML. Rationale: prevents stale or
cross-user data exposure from a shared device.

### XI. v1 Capability Fences

v1 MUST NOT include: HTTP/uptime probing of services, background polling or live
status streaming, WebGL or parallax effects, Google/OAuth/SSO login, an API key,
or any programmatic control ("AI-control") API. Service status in v1 MUST derive
only from Docker container state and container healthchecks. Any future API MUST be
specified separately and MUST use independently revocable, narrowly scoped tokens;
it MUST NEVER provide generic shell execution, Docker mutation, or raw socket
access. Rationale: each fenced capability adds real risk or complexity that v1 does
not need.

### XII. Evidence & Documentation for Every Change

Every implementation change MUST ship with tests or explicit verification evidence
(commands run and their output). Operational documentation MUST be updated in the
same change when behaviour, deployment, or recovery steps are affected.
`docker compose down -v` MUST NEVER be used; deployment and recovery MUST follow
the server's documented runbook conventions. Rationale: an undocumented or
unverified change to a home-infrastructure service is a future outage.

## Governance Precedence & Server Authority

When guidance conflicts, this order decides:

1. **User (product owner) instructions.**
2. **The server's operational documentation** — the host runbook and setup notes,
   maintained privately on the server — for anything touching server operations.
3. **This Constitution** — for homemedia-portal engineering rules.
4. **Feature specifications, plans, tasks, and code.**

If a portal requirement conflicts with the server's operational documentation, work
MUST STOP and the conflict MUST be reported to the product owner. The conflict is
resolved only by an explicit product-owner decision or a recorded amendment to this
Constitution — never by silently overriding the server documents.

## Development Workflow & Quality Gates

- **Spec-driven.** Work follows the Spec Kit flow: constitution → specification →
  clarification → plan → tasks → implementation. Code changes MUST trace to a
  merged specification.
- **Review gates.** The specification and the implementation plan are each reviewed
  and merged via their own pull request before the next phase begins. GitHub issues
  for tasks are created only after the plan is reviewed.
- **Constitution Check.** Every plan MUST include a Constitution Check section and
  MUST NOT proceed while any principle is violated without a recorded, approved
  exception.
- **Public-repository hygiene.** Every PR MUST be checked for secrets and
  infrastructure disclosure before merge.
- **Verification.** Every implementation PR states how it was verified; unverified
  changes MUST NOT be merged.

## Governance

- **Authority.** This Constitution governs engineering practice in this repository,
  subject to the precedence order above.
- **Amendments.** Changes require a pull request that states the rationale, updates
  affected templates/docs, and bumps the constitution version.
- **Versioning.** Semantic versioning of this document:
  - **MAJOR** — a principle is removed or redefined in a backward-incompatible way,
    or the governance model changes.
  - **MINOR** — a new principle or section is added, or guidance is materially
    expanded.
  - **PATCH** — clarifications and wording that do not change meaning.
- **Compliance review.** Reviewers MUST verify PR compliance with these principles.
  Complexity or deviation MUST be justified in writing and approved by the product
  owner.

**Version**: 1.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29
