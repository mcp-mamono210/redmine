# ADR-025: Use Redmine as the durable execution Source of Truth

Status: Accepted  
Date: 2026-09-13

## Context

ADR-024 separates the Redmine / MCP approval control plane from the Agent Runner
execution plane. Phase 45-2 must now define which component owns each durable
fact before execution implementation introduces new runtime state.

v0.3.0 already separates Redmine from versioned Brief storage: Redmine owns
requirements, lifecycle, and approval facts, while versioned Brief storage owns
the immutable Agent Brief content and revision history.

v0.4.0 adds an Agent Runner, execution lifecycle, transient Workspace and
container state, application source, and durable change artifacts. Without an
explicit Source of Truth boundary, the system could accidentally create a
second durable execution state store inside the Runner, treat Git or Brief
storage as a queue, or rely on transient local state as business truth.

The design also needs to keep execution lifecycle state separate from execution
result artifacts. A durable patch artifact and the durable lifecycle record are
both necessary, but they serve different responsibilities and must not become
competing authorities for the same information.

## Decision

Use Redmine as the only durable Source of Truth for requirements, approval
state, business state, and durable Agent execution lifecycle in v0.4.0.

Do not introduce an Agent Runner database as a second authoritative execution-
lifecycle store.

Keep the established ownership split:

```text
Redmine
  = requirements
  = business / priority state
  = Agent Brief lifecycle
  = approval metadata
  = durable execution lifecycle

versioned Brief storage
  = Agent Brief content
  = Brief revision history

Application Git
  = application source

private S3
  = durable change artifact
```

Treat the following Runner-local state as transient rather than durable business
state:

```text
Workspace
Agent container
local lock
```

Do not use Application Git or versioned Brief storage as a runtime Queue,
claim store, lease store, or durable execution-lifecycle store.

Keep durable control state and durable result artifacts separate:

```text
Redmine
  = durable control / execution lifecycle

private S3
  = durable change artifact
```

The execution target source revision will be represented through Redmine
execution-record semantics, but Phase 45-2 does not define the execution-record
schema, custom-field mapping, or serialization. Those details remain Phase 46
responsibilities.

This ADR fixes authoritative ownership, not storage implementation details. It
does not define a Runner database implementation, S3 object layout, artifact
manifest, local-lock mechanism, or execution-record field mapping.

Changing the authoritative ownership of any of these information categories
requires an explicit contract / ADR change rather than an incidental
implementation choice.

## Consequences

Execution lifecycle state can be reconstructed from one durable control-plane
Source of Truth instead of reconciling two competing databases.

A Runner restart does not make local Workspace, container, or lock state the
canonical record of what the business lifecycle says happened.

Versioned Brief storage remains focused on immutable Agent Brief persistence and
history rather than becoming a scheduling mechanism.

Application Git remains focused on application source rather than becoming a
runtime queue or execution ledger.

Private S3 can hold durable execution results without becoming authoritative for
approval or lifecycle state. The system can therefore distinguish a durable
artifact fact from the durable lifecycle fact that references it.

Later phases may define execution-record schema, artifact structure, local lock
behavior, recovery, and polling while preserving the ownership boundary set
here.

If a future architecture requires multiple durable execution authorities,
durable distributed claims, a separate queue database, or a Runner-owned
lifecycle store, that change requires a new explicit design decision and a
migration / reconciliation contract.
