# Agent Runner Execution Boundary Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 45 system contract for the boundary between
the Redmine / MCP approval control plane and the Agent Runner execution plane.

Phase 45-1 established the architecture / deployment boundary and release
ownership. Phase 45-2 extended the same canonical document with component
responsibility, Source of Truth ownership, and the durable / transient state
boundary. Phase 45-3 extends it with lifecycle write ownership, the
pre-execution failure boundary, and the execution outcome taxonomy. Later Phase
45 tickets extend this document with the remaining Phase 45 responsibilities
rather than creating a second competing system contract.

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
- one authoritative Source of Truth for each durable information category;
- the durable / transient state boundary for the initial Runner design;
- lifecycle write ownership between Approval Handler and Agent Controller;
- the normal execution lifecycle and pre-execution failure boundary; and
- the execution outcome taxonomy and Redmine Status / outcome separation.

This revision does not define the Phase 45-4 polling / startup contract or the
Phase 45-5 final cross-contract verification. It also does not define the
execution eligibility algorithm, a new requirements-fingerprint algorithm,
execution-record schema, physical Redmine field mapping, timeout or retry
implementation, Agent Adapter implementation, S3 object layout,
artifact-manifest schema, local-lock implementation, or Runner database
implementation.

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
| Controller | Execution-side polling, revalidation, execution lifecycle mutation, and Worker control; lifecycle write set is fixed by this contract |
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

The exact Approval Handler and Controller lifecycle write sets are defined in
the Lifecycle Write Ownership section below. Component responsibility and
lifecycle mutation authority therefore remain part of one canonical contract.

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
Lifecycle ownership is defined by this contract. Runtime candidate selection is
defined by the later Phase 45 polling contract, using Redmine as the durable
control-plane Source of Truth.

Phase 45-2 does not introduce a distributed queue, durable Runner queue, claim,
lease, or heartbeat mechanism.

## Lifecycle Write Ownership

Approval lifecycle and execution lifecycle have separate writers. The boundary
at `Ready for Agent` is a handoff boundary, not a shared write surface.

Approval Handler owns the approval-side lifecycle write set:

```text
Brief Draft
Brief Ready
Ready for Agent
```

Approval Handler must not write execution-side lifecycle states:

```text
Agent Running
Ready for Independent Verification
Needs Human
```

Agent Controller owns the execution-side lifecycle target set after a valid
`Ready for Agent` handoff:

```text
Agent Running
Ready for Independent Verification
Needs Human
```

Agent Controller must not:

- write `Brief Draft`;
- write `Brief Ready`;
- rewrite approval metadata;
- perform Human Review;
- redefine Handler Validation semantics; or
- directly roll an execution failure back into the approval lifecycle.

The normal execution lifecycle is:

```text
Ready for Agent
  -> Agent Running
  -> Ready for Independent Verification
```

`Ready for Agent` remains the approval-side handoff state established by the
v0.3.0 contract. Agent Controller consumes that state; it does not redefine its
meaning or ownership.

The writer boundary therefore remains:

```text
Approval Handler
  = approval lifecycle writer

Agent Controller
  = execution lifecycle writer
```

The concrete Redmine field mapping and mutation implementation are outside
Phase 45-3. This section fixes write responsibility and state semantics only.

## Pre-execution Failure Boundary

A validation failure detected before Agent start must not be represented as a
partial execution.

The conceptual boundary is:

```text
Ready for Agent
  -> pre-execution validation failure
  -> Agent is not started
  -> Needs Human
  + corresponding execution outcome
```

If requirements revalidation detects a mismatch between the current
requirements fingerprint and the approved requirements fingerprint, the result
is:

```text
status:
  Needs Human

outcome:
  stale_requirements
```

If another execution-eligibility condition fails before Agent start, the result
is:

```text
status:
  Needs Human

outcome:
  eligibility_failed
```

`stale_requirements` is reserved for requirements-fingerprint mismatch.
`eligibility_failed` covers other pre-execution eligibility failures whose
detailed classification is owned by Phase 46.

In either case, Agent Controller must not start the Agent, must not rewrite
approval metadata, and must not transition directly to `Brief Draft` or
`Brief Ready`.

A later Human / approval workflow decides whether the Brief must be regenerated,
reviewed, or approved again. Agent Controller reports the execution-side reason
and stops at the `Needs Human` boundary.

Phase 45-3 does not define the detailed eligibility algorithm, fingerprint
algorithm, execution-record schema, or physical persistence of the outcome.

## Execution Outcome Taxonomy

Redmine Status and execution outcome serve different responsibilities.

```text
Redmine Status
  = lifecycle category / routing state

execution outcome
  = concrete result or reason for the execution attempt
```

v0.4.0 must preserve at least the following outcome identities:

```text
changes_ready
no_changes

stale_requirements
eligibility_failed

interrupted
timeout
agent_start_failed
agent_failed

artifact_persistence_failed
```

The lifecycle meaning of these outcomes is:

| Outcome | Lifecycle target | Phase 45-3 meaning |
| --- | --- | --- |
| `changes_ready` | `Ready for Independent Verification` | An execution produced changes eligible for independent verification. |
| `no_changes` | `Ready for Independent Verification` | An execution produced no source diff; the result still requires independent verification. |
| `stale_requirements` | `Needs Human` | Pre-execution requirements fingerprint mismatch. Agent is not started. |
| `eligibility_failed` | `Needs Human` | Another pre-execution eligibility condition failed. Agent is not started. |
| `interrupted` | `Needs Human` | Execution did not reach a durable verifiable result because execution was interrupted. |
| `timeout` | `Needs Human` | Execution exceeded its allowed execution boundary. |
| `agent_start_failed` | `Needs Human` | The Agent could not be started. |
| `agent_failed` | `Needs Human` | The Agent started but execution failed. |
| `artifact_persistence_failed` | `Needs Human` | A result could not be made durable through the artifact persistence boundary. |

The taxonomy is intentionally compact. Redmine Status must not grow one status
per failure reason merely to preserve diagnostic detail; the outcome retains
that detail while Status continues to describe lifecycle routing.

Phase 45-3 defines outcome identity and lifecycle responsibility only. Detailed
production conditions and handling remain with the phases that own those
behaviors:

```text
Phase 46
  execution eligibility and pre-execution validation details

Phase 48
  Agent start, interruption, timeout, Agent failure, and recovery behavior

Phase 49
  changes/no-changes artifact semantics and artifact persistence behavior
```

This phase does not define retry behavior, timeout implementation, Agent Adapter
implementation, artifact schema, or physical Redmine outcome mapping.

## Verification Obligations

Phase 45-3 is an architecture / contract step and does not require Agent runtime
implementation or runtime tests.

Repository review for this revision must establish that:

- this file remains the single canonical Phase 45 system contract in the Redmine
  MCP repository;
- the repository / deployment, release ownership, component responsibility, and
  Source of Truth boundaries established by Phase 45-1 and Phase 45-2 remain
  unchanged;
- Approval Handler writes only approval-side lifecycle states and does not write
  `Agent Running`, `Ready for Independent Verification`, or `Needs Human`;
- Agent Controller targets only `Agent Running`,
  `Ready for Independent Verification`, and `Needs Human` on the execution side;
- Agent Controller does not write `Brief Draft` or `Brief Ready`, rewrite
  approval metadata, perform Human Review, or redefine Handler Validation;
- the normal execution lifecycle is `Ready for Agent -> Agent Running -> Ready
  for Independent Verification`;
- pre-execution validation failure does not start the Agent and routes to
  `Needs Human` with a corresponding outcome;
- requirements fingerprint mismatch is represented as
  `Needs Human + stale_requirements`;
- other pre-execution eligibility failure is represented as
  `Needs Human + eligibility_failed`;
- Agent Controller does not roll stale or invalid execution candidates directly
  back into the approval lifecycle;
- the minimum outcome taxonomy contains `changes_ready`, `no_changes`,
  `stale_requirements`, `eligibility_failed`, `interrupted`, `timeout`,
  `agent_start_failed`, `agent_failed`, and `artifact_persistence_failed`;
- Redmine Status describes lifecycle routing while outcome preserves the
  concrete execution result or failure reason; and
- this revision does not define execution eligibility algorithms, physical
  Redmine field mapping, timeout / retry implementation, Agent Adapter
  implementation, polling / startup behavior, or artifact schema.

The architecture decision rationales for the established Phase 45 boundaries
are recorded in:

- `docs/adr/ADR-024-separate-agent-runner-execution-plane.md`
- `docs/adr/ADR-025-use-redmine-as-durable-execution-source-of-truth.md`
- `docs/adr/ADR-026-separate-approval-and-execution-lifecycle-writers.md`
