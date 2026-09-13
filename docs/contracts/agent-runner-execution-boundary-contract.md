# Agent Runner Execution Boundary Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 45 system contract for the boundary between
the Redmine / MCP approval control plane and the Agent Runner execution plane.

Phase 45-1 establishes only the architecture / deployment boundary and release
ownership sections of this contract. Later Phase 45 tickets extend this same
document with the remaining Phase 45 responsibilities rather than creating a
second competing system contract.

The canonical copy of this cross-component contract remains in the
`mcp-mamono210/redmine` repository even after the Agent Runner repository is
created. Runner-side documentation may reference this document, but must not
become a second authoritative copy of the same system boundary.

This revision defines:

- the repository boundary between Redmine MCP and Agent Runner;
- the deployment / host separation between the control plane and execution
  plane;
- the initial single-Controller / single-Worker execution topology;
- independent component release ownership; and
- the meaning of the v0.4.0 system-level compatibility milestone.

This revision does not define the later Phase 45 component-responsibility,
Source-of-Truth, lifecycle-write, execution-outcome, polling, or startup
contracts. Those responsibilities are added by Phase 45-2 through Phase 45-5.

The following implementation work is also outside Phase 45-1:

```text
Agent Runner repository creation
GCE provisioning
Runner source implementation
credential implementation
sandbox implementation
distributed coordination
release manifest serialization
actual component release
```

The v0.3.0 `Ready for Agent` handoff contract remains the upstream execution
input boundary. Phase 45-1 does not redefine Agent Brief lifecycle, Human
Review, Handler Validation, approval metadata, requirements fingerprinting, or
the meaning of `Ready for Agent`.

## Architecture / Deployment Boundary

The system is divided into a control plane and an execution plane:

```text
mcp-mamono210/redmine
  = Redmine / MCP / approval control plane

mcp-mamono210/ai-agent-runner
  = Agent execution plane
```

The Agent Runner must be isolated from the Redmine / MCP deployment along four
structural boundaries:

```text
separate repository
separate GCE deployment
separate credentials
separate execution sandbox
```

The Redmine / MCP host must not spawn an Agent process. Agent process creation
belongs only to the dedicated Agent Runner execution plane.

The initial v0.4.0 execution topology is intentionally bounded to:

```text
Controller = 1
Worker = 1
concurrent execution = 1
```

Phase 45-1 does not require or authorize multiple Runner instances, multiple
Workers, distributed claim / lease / heartbeat, or any other distributed
coordination mechanism.

This separation is an architecture boundary, not only an operational
preference. The execution plane is expected to handle source checkout,
filesystem mutation, Agent process execution, and execution-time network access,
which have a different threat model from the Redmine / MCP approval control
plane.

Accordingly, later implementation must preserve the following invariant:

```text
Redmine / MCP deployment
  !=
Agent Runner deployment
```

A future change that embeds Agent execution in the Redmine / MCP process,
shares the same execution credential boundary, or removes the dedicated
execution sandbox requires an explicit contract and architecture review.

## Release Ownership

Redmine MCP and Agent Runner are independently versioned components:

```text
Redmine MCP
  = independent SemVer

Agent Runner
  = independent SemVer
```

Their component versions must not be lockstep. A Redmine MCP release does not
require an Agent Runner release with the same version number, and an Agent
Runner release does not require the Redmine MCP component to adopt the same
version number.

`v0.4.0` is a system-level compatibility milestone. It identifies a compatible
combination of independently released components and contract revisions; it is
not the component SemVer of either Redmine MCP or Agent Runner.

A v0.4.0-compatible system release must make it possible to identify at least
the following compatibility dimensions:

```text
platform milestone
Redmine MCP version
Agent Runner version
handoff contract revision
execution / artifact contract revision
```

This section fixes the ownership and traceability semantics only. The concrete
release-manifest file format, schema, serialization, storage location, and
release automation are later responsibilities and are not defined by Phase
45-1.

Compatibility tracking must therefore preserve both facts at the same time:

1. each component owns and publishes its own version independently; and
2. the system milestone records which component versions and contract revisions
   were verified together as compatible.

A future decision to force lockstep component versions or to collapse the
system milestone into one component's SemVer requires an explicit contract and
architecture review.

## Verification Obligations

Phase 45-1 is an architecture / contract step and does not require Agent runtime
implementation or runtime tests.

Repository review for this revision must establish that:

- this file is the single canonical Phase 45 system contract in the Redmine MCP
  repository;
- the repository and deployment boundaries match Phase 45 / `040_ロードマップ`;
- no contract path permits the Redmine / MCP host to spawn an Agent process;
- the initial topology is exactly one Controller, one Worker, and one concurrent
  execution;
- Redmine MCP and Agent Runner retain independent component version ownership;
- v0.4.0 is described as a system-level compatibility milestone rather than a
  lockstep component version; and
- this revision does not introduce Runner implementation, GCE provisioning,
  credential / sandbox implementation, distributed coordination, or release
  manifest serialization.

The architecture decision rationale for this boundary is recorded in
`docs/adr/ADR-024-separate-agent-runner-execution-plane.md`.
