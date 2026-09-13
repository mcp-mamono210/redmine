# Agent Runner Execution Boundary Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 45 system contract for the boundary between
the Redmine / MCP approval control plane and the Agent Runner execution plane.

Phase 45-1 established the architecture / deployment boundary and release
ownership. Phase 45-2 extends the same canonical document with component
responsibility, Source of Truth ownership, and the durable / transient state
boundary. Later Phase 45 tickets extend this document with the remaining Phase
45 responsibilities rather than creating a second competing system contract.

The canonical copy of this cross-component contract remains in the
`mcp-mamono210/redmine` repository even after the Agent Runner repository is
created. Runner-side documentation may reference this document, but must not
become a second authoritative copy of the same system boundary.

This revision defines:

- the repository boundary between Redmine MCP and Agent Runner;
- the deployment / host separation between the control plane and execution
  plane;
- the initial single-Controller / single-Worker execution topology;
- independent component release ownership;
- the meaning of the v0.4.0 system-level compatibility milestone;
- responsibility ownership for the major execution-system components;
- one authoritative Source of Truth for each durable information category; and
- the durable / transient state boundary for the initial Runner design.

This revision does not define the Phase 45-3 lifecycle-write or execution-
outcome contracts, the Phase 45-4 polling / startup contract, or the Phase 45-5
final cross-contract verification. It also does not define execution-record
schema, physical Redmine field mapping, S3 object layout, artifact-manifest
schema, local-lock implementation, or Runner database implementation.

The v0.3.0 `Ready for Agent` handoff contract remains the upstream execution
input boundary. Phase 45 does not redefine Agent Brief lifecycle, Human Review,
Handler Validation, approval metadata, requirements fingerprinting, or the
meaning of `Ready for Agent`.

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

Phase 45 does not require or authorize multiple Runner instances, multiple
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
release automation are later responsibilities and are not defined by Phase 45.

Compatibility tracking must therefore preserve both facts at the same time:

1. each component owns and publishes its own version independently; and
2. the system milestone records which component versions and contract revisions
   were verified together as compatible.

A future decision to force lockstep component versions or to collapse the
system milestone into one component's SemVer requires an explicit contract and
architecture review.

## Component Responsibility

Each major component has one primary responsibility boundary. This table fixes
ownership at the system-contract level; it does not prescribe private classes,
process layout, internal helper structure, or implementation language.

| Component | Responsibility |
| --- | --- |
| Redmine | Source of Truth for requirements, approval state, business state, and durable execution lifecycle |
| Redmine MCP | Bounded public contract for authorized Redmine reads and writes |
| ChatGPT | Agent Brief Draft creation, Human Review support, and explicit human-approved approval operation |
| versioned Brief storage | Source of Truth for Agent Brief content and revision history |
| Approval Handler | Validation, approval consistency, and approval workflow through `Ready for Agent` |
| Agent Runner | Execution-plane responsibility after `Ready for Agent` handoff |
| Controller | Execution-side polling, revalidation, lifecycle mutation, and Worker control; exact write set is fixed by Phase 45-3 |
| Worker / Sandbox | Transient execution environment for one Agent execution |
| Agent provider | Source-code implementation within the provided execution boundary |
| Application Git | Source of Truth for application source |
| private S3 | Source of Truth for durable change artifacts |
| Independent Verification | Independent validation of an Agent execution result and its durable artifact |

The component table is an ownership boundary, not an authorization shortcut.
Later implementation must still enforce the credential, permission, security,
and lifecycle contracts owned by their corresponding phases.

Agent Runner is not required to be exposed as a public MCP Tool for v0.4.0.
ChatGPT is not the Agent execution Controller.

The exact Approval Handler and Controller lifecycle write sets are intentionally
left to Phase 45-3. This section establishes component responsibility without
preempting that lifecycle contract.

## Source of Truth Boundary

Every durable information category has one authoritative Source of Truth.
Having a durable copy for transport, caching, or recovery must not silently turn
that copy into a second business-state authority.

| Information | Source of Truth |
| --- | --- |
| requirements | Redmine |
| business state / priority | Redmine |
| Agent Brief lifecycle | Redmine |
| approval state / metadata | Redmine |
| durable execution lifecycle | Redmine |
| Agent Brief content | versioned Brief storage |
| Agent Brief revision history | versioned Brief storage |
| application source | Application Git |
| execution target source revision | Redmine execution record semantics; concrete schema is Phase 46 |
| durable change artifact | private S3 |
| Workspace | transient, not a Source of Truth |
| Agent container | transient, not a Source of Truth |
| local lock | transient, not a Source of Truth |

For v0.4.0, Redmine remains the only durable Source of Truth for execution
lifecycle state. Agent Runner must not introduce its own durable database as a
second execution-lifecycle authority.

The prohibition is specifically against a second durable Source of Truth. This
contract does not define a Runner database implementation, cache, or storage
technology. Any future persistence added inside the Runner must not change the
system's authoritative ownership without an explicit contract / ADR change.

Versioned Brief storage is authoritative for Brief bytes and Brief revision
history only. It is not the authoritative runtime scheduler, claim store, or
execution-lifecycle store.

Application Git is authoritative for application source only. It is not the
runtime execution queue and does not become the execution-lifecycle Source of
Truth merely because an execution refers to a repository and source revision.

Private S3 is authoritative for the durable change artifact produced by an
execution. It does not own approval state or execution lifecycle state.

The system therefore intentionally separates durable control state from durable
result state:

```text
Redmine
  = durable control / execution lifecycle

private S3
  = durable change artifact
```

The exact execution-record schema and the physical representation of the
execution target source revision are Phase 46 responsibilities. Phase 45-2 fixes
ownership only.

## Durable / Transient State Boundary

The following state is durable because later system behavior depends on it as
an authoritative historical or business fact:

```text
Redmine
  requirements
  business / priority state
  Brief lifecycle
  approval metadata
  durable execution lifecycle

versioned Brief storage
  Agent Brief content
  Brief revision history

Application Git
  application source

private S3
  durable change artifact
```

The following state is transient:

```text
Workspace
Agent container
local lock
```

Transient state may support one execution while it is running, but must not be
the sole authoritative record of a durable business fact. Losing a Workspace,
container, or local lock must not require treating its local contents as the
system's canonical approval or execution lifecycle state.

A local lock may later prevent duplicate local execution, but it is not a
claim ledger, queue, execution history, or recovery Source of Truth. Its concrete
implementation remains outside Phase 45-2.

Likewise, a Workspace or Agent container may contain a working copy and
execution-local files, but those objects are disposable execution environment,
not durable system state.

## Runtime Queue Boundary

Neither Git nor versioned Brief storage is a runtime Queue for v0.4.0.

The system must not infer runtime scheduling or execution ownership from facts
such as:

```text
a Git branch exists
an Agent Brief file exists
a newer Brief revision exists
a repository directory contains a marker file
```

Those storage systems keep their existing source / artifact responsibilities.
Runtime candidate selection and lifecycle ownership are defined by later Phase
45 polling and lifecycle contracts, using Redmine as the durable control-plane
Source of Truth.

Phase 45-2 does not introduce a distributed queue, durable Runner queue, claim,
lease, or heartbeat mechanism.

## Verification Obligations

Phase 45-2 is an architecture / contract step and does not require Agent runtime
implementation or runtime tests.

Repository review for this revision must establish that:

- this file remains the single canonical Phase 45 system contract in the Redmine
  MCP repository;
- the repository and deployment boundaries still match Phase 45 /
  `040_roadmap` semantics;
- no contract path permits the Redmine / MCP host to spawn an Agent process;
- the initial topology remains exactly one Controller, one Worker, and one
  concurrent execution;
- Redmine MCP and Agent Runner retain independent component version ownership;
- v0.4.0 remains a system-level compatibility milestone rather than a lockstep
  component version;
- every major component in Phase 45-2 has one explicit responsibility;
- requirements, approval state, business state, and durable execution lifecycle
  resolve to Redmine as their authoritative Source of Truth;
- Agent Brief content / revision history resolve to versioned Brief storage;
- application source resolves to Application Git;
- durable change artifacts resolve to private S3;
- Workspace, Agent container, and local lock are explicitly transient;
- no Runner database is defined as a second durable execution-lifecycle Source
  of Truth;
- Git and versioned Brief storage are not defined as runtime Queues; and
- this revision does not define execution-record schema, Redmine field mapping,
  S3 object layout, artifact-manifest schema, local-lock implementation, or the
  Phase 45-3 lifecycle / outcome contract.

The architecture decision rationales for the established Phase 45 boundaries
are recorded in:

- `docs/adr/ADR-024-separate-agent-runner-execution-plane.md`
- `docs/adr/ADR-025-use-redmine-as-durable-execution-source-of-truth.md`
