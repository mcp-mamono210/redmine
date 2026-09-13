# Agent Runner Execution Boundary Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 45 system contract for the boundary between
the Redmine / MCP approval control plane and the Agent Runner execution plane.

Phase 45-1 established the architecture / deployment boundary and release
ownership. Phase 45-2 extended the same canonical document with component
responsibility, Source of Truth ownership, and the durable / transient state
boundary. Phase 45-3 extended it with lifecycle write ownership, the
pre-execution failure boundary, and the execution outcome taxonomy. Phase 45-4
extended the same document with the pull-based polling contract, startup ordering,
and the durable poll-to-execution boundary. Phase 45-5 completes this contract by
verifying compatibility with the v0.3.0 `Ready for Agent` handoff and by fixing
the responsibility boundary for Phase 46 through Phase 50.

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
- the normal execution lifecycle and pre-execution failure boundary;
- the execution outcome taxonomy and Redmine Status / outcome separation;
- pull-based, idle-only polling from the Redmine durable control plane;
- startup reconciliation ordering before ordinary candidate polling;
- the ordered boundary from a polled candidate to durable `Agent Running`
  mutation and Agent start;
- compatibility with the existing v0.3.0 `Ready for Agent` handoff contract; and
- the responsibility boundary that separates Phase 45 architecture from Phase
  46 through Phase 50 implementation contracts.

This revision completes the Phase 45 architecture / contract boundary. It does
not define the polling-loop implementation, local-lock
implementation, Redmine client implementation, execution eligibility algorithm,
a new requirements-fingerprint algorithm, source-revision implementation,
execution-record schema, physical Redmine field mapping, startup reconciliation
algorithm, timeout or retry implementation, Agent Adapter implementation, S3
object layout, artifact-manifest schema, Webhook execution, distributed queue /
claim / lease, or Runner database implementation.

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
defined by the Polling Contract below, using Redmine as the durable control-plane
Source of Truth.

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

## Polling Contract

Agent Runner uses a pull-based Controller for the initial v0.4.0 topology. A
Webhook-driven execution path is not required for v0.4.0.

The polling contract is:

```text
poll condition:
  Controller is idle

default interval:
  30 seconds

filter:
  allowed project
  +
  status = Ready for Agent

concurrency:
  1
```

The polling interval must be configurable. `30 seconds` is the initial default,
not a fixed protocol constant.

Normal candidate polling occurs only while the Controller is idle. With one
Controller, one Worker, and one concurrent execution, v0.4.0 does not require
the Controller to continue polling for additional work while an execution is
active.

Candidate selection must be bounded and based on direct Redmine filtering for
an allowed project and `Ready for Agent` status. The contract must not depend on
a mutable Redmine saved query as an authoritative runtime interface.

A polling result is only a candidate indication. It does not authorize Agent
start by itself. The Issue must be re-fetched and revalidated at the
poll-to-execution boundary before any execution is started.

The exact Redmine client call shape, page size, candidate ordering, polling loop
implementation, and scheduling mechanism remain implementation responsibilities.
They must preserve the bounded, idle-only, direct-filter semantics fixed here.

The pull contract does not introduce a durable Runner queue, distributed claim,
lease, heartbeat, or another distributed coordination mechanism.

## Startup Contract

Controller startup must reconcile already-durable execution state before normal
candidate polling begins.

The startup ordering is:

```text
Controller startup
  -> startup reconciliation
  -> idle
  -> poll
```

Normal `Ready for Agent` polling must not occur before startup reconciliation is
complete. If reconciliation cannot complete, the Controller must not skip that
boundary and proceed directly to ordinary polling or new Agent execution.

Startup reconciliation exists because Redmine is the durable execution lifecycle
Source of Truth. A restarted Controller must account for durable execution-side
state such as an existing `Agent Running` lifecycle state before accepting new
work.

Phase 45-4 fixes only the ordering and ownership requirement. The concrete
reconciliation algorithm, artifact recovery decisions, interruption handling,
and orphan-runtime cleanup are Phase 48 responsibilities.

Startup reconciliation is not permission to blindly retry an Agent execution.
Any later recovery behavior must preserve the lifecycle and outcome contracts
already established by Phase 45-3.

## Poll-to-Execution Boundary

A polled `Ready for Agent` Issue must pass an ordered pre-execution boundary
before Agent start:

```text
poll
  -> Ready for Agent candidate
  -> local duplicate prevention
  -> Issue re-fetch
  -> approval / eligibility validation
  -> requirements revalidation
  -> exact source revision determination
  -> execution record preparation
  -> Agent Running durable mutation
  -> Agent start
```

Candidate discovery and Agent start are therefore separate operations. The
Controller must not treat the state observed by the polling request as sufficient
proof that the Issue remains executable.

Local duplicate prevention is transient protection for the single-Runner /
single-Worker design. It is not a durable claim or execution Source of Truth,
and its concrete implementation is a Phase 48 responsibility.

The Issue re-fetch establishes the current Redmine state used by subsequent
validation. Approval / eligibility validation and requirements revalidation must
finish before Agent start. A pre-execution validation failure must follow the
Phase 45-3 failure boundary: the Agent is not started and the execution-side
lifecycle is routed to `Needs Human` with the corresponding outcome.

Exact source revision determination and execution-record preparation are ordered
before the `Agent Running` mutation, but their detailed semantics, identity
fields, serialization, and Redmine field mapping are Phase 46 responsibilities.

`Agent Running` is a durable lifecycle mutation in Redmine. The Controller must
not start the Agent process until that durable mutation succeeds.

If the `Agent Running` mutation fails, is rejected, or cannot be established as
successful, the Controller must not proceed to Agent start. This preserves the
invariant that no new Agent process exists without the durable Redmine lifecycle
showing that execution has entered `Agent Running`.

This section defines ordering and safety boundaries only. It does not implement
the polling loop, local lock, eligibility checks, requirements fingerprinting,
source checkout, execution record, Redmine mutation helper, reconciliation
algorithm, Worker, or Agent Adapter.

## v0.3.0 Handoff Compatibility

Phase 45 consumes the v0.3.0 handoff contract; it does not redefine it. The
canonical upstream handoff remains:

```text
docs/contracts/agent-brief-release-handoff-contract.md
```

`Ready for Agent` retains its v0.3.0 meaning: one human-reviewed persisted Agent
Brief has passed Handler Validation, the approval fact is complete and
consistent, and the exact approved artifact can be recovered for a later
execution consumer. `Brief Ready` remains validation-pending and is not Agent
execution permission.

Phase 45 preserves the minimum handoff evidence established by v0.3.0:

```text
repository
redmine_issue_id
approved Brief revision
approved persisted revision
approved requirements fingerprint
approver identity
approval time
retrievable exact approved Brief
```

The physical Redmine mapping and the semantics of these approval fields remain
owned by the v0.3.0 Agent Brief contracts. Agent Controller must consume the
approval fact as read-only execution input; it must not rewrite approval metadata
to record claim time, Agent start time, retry time, Worker identity, or another
execution fact.

Phase 45 also preserves the v0.3.0 requirements-revalidation rule. `Ready for
Agent` proves that the approved Brief and requirements were consistent at the
approval / reconciliation point; it does not prove that requirements remain
unchanged until execution starts.

Before Agent start, the execution layer must reuse the existing bounded
requirements-input and fingerprint semantics and compare the current
requirements fingerprint with the approved requirements fingerprint. Phase 45
does not introduce a Runner-specific canonicalization rule, a second fingerprint
algorithm, or an `updated_on` freshness shortcut.

The compatibility result is:

```text
current requirements fingerprint == approved requirements fingerprint
  -> the approved Brief remains requirements-current
  -> later execution-specific eligibility gates may continue

current requirements fingerprint != approved requirements fingerprint
  -> Agent is not started
  -> Needs Human
  -> outcome = stale_requirements
```

A fingerprint-generation or handoff-validation failure is not treated as valid
execution permission. The execution layer fails closed and preserves the
Phase 45-3 `Needs Human + outcome` boundary.

The v0.3.0 handoff contract's reference to a future Agent runtime layer describes
future runtime responsibility; it does not require a Runner-owned durable queue,
claim database, or second execution-lifecycle Source of Truth. Phase 45 refines
that later architecture by keeping durable execution lifecycle in Redmine while
leaving Workspace, Agent container, and local lock transient.

Therefore Phase 45 adds an execution plane after `Ready for Agent` without
changing:

- Human Review responsibility;
- Handler Validation responsibility;
- approval consistency semantics;
- approval metadata meaning;
- Agent Brief immutable identity;
- requirements fingerprint semantics; or
- the release-level meaning of `Ready for Agent`.

## Phase 46-50 Responsibility Boundary

Phase 45 fixes architecture, ownership, lifecycle, outcome, polling, startup,
and handoff-compatibility semantics. The following responsibilities remain in
later phases and must be implemented without changing those Phase 45 decisions.

### Phase 46 - Execution Handoff / Input Snapshot

Phase 46 owns the concrete execution-input contract:

```text
execution eligibility rules
requirements revalidation use
exact source revision determination
execution identity
execution record semantics
physical Redmine execution-record mapping
```

Phase 46 may define schemas and concrete validation details, but must reuse the
v0.3.0 requirements / approval contracts and the Phase 45 lifecycle boundary. It
must not redefine `Ready for Agent`, create a second requirements fingerprint
semantics, or start an Agent before the durable `Agent Running` gate.

### Phase 47 - Runner Security / Sandbox Contract

Phase 47 owns:

```text
credential boundary
sandbox boundary
filesystem mount boundary
repository authorization
network policy
resource / timeout policy
```

Those controls must preserve the Phase 45 deployment and Source of Truth
boundaries; they do not move Agent execution into the Redmine / MCP host or make
transient sandbox state authoritative.

### Phase 48 - Controller / Worker / Agent Adapter / Recovery

Phase 48 owns the runtime implementation of:

```text
Controller polling loop
local duplicate prevention
Worker execution
Agent Adapter
one-shot Agent execution
startup reconciliation algorithm
interruption / recovery behavior
```

Its implementation must preserve idle-only bounded polling, startup
reconciliation before normal polling, lifecycle-writer separation, and the
ordered durable `Agent Running` mutation before Agent start.

### Phase 49 - Artifact / S3 / Verification Handoff

Phase 49 owns:

```text
artifact manifest
patch / no-change artifact semantics
private S3 persistence
artifact integrity verification
artifact reference
independent-verification handoff
```

Private S3 remains the durable change-artifact Source of Truth while Redmine
remains the durable execution-lifecycle Source of Truth.

### Phase 50 - Deterministic Integration / E2E

Phase 50 owns deterministic cross-boundary verification, including execution
success, no-change, stale, failure, interruption / recovery, artifact restore,
and security regression scenarios. Phase 45 does not require these runtime tests
for architecture completion.

The Phase 46 entry boundary is therefore fully determined. Phase 46 can begin
without another architecture decision because it receives all of the following
as fixed upstream contracts:

```text
v0.3.0 Ready for Agent handoff semantics
Phase 45 deployment / component boundary
Phase 45 Source of Truth ownership
Phase 45 lifecycle writer ownership
Phase 45 execution outcome taxonomy
Phase 45 polling / startup ordering
Phase 45 poll-to-execution safety boundary
```

If a later phase needs to change one of those facts, that is an explicit Phase
45 contract / ADR change rather than an incidental implementation decision.

## Verification Obligations

Phase 45-5 is the final Phase 45 cross-contract verification gate. It does not
require Agent runtime implementation or runtime tests.

Final repository review must establish that:

- Phase 45-1 through Phase 45-4 contract responsibilities are represented in
  this one canonical document;
- ADR-024 through ADR-027 are registered in `docs/adr/README.md` and their
  Decisions agree with this canonical contract;
- documentation precedence identifies this file as the authoritative Agent
  Runner execution architecture / lifecycle / Source of Truth contract;
- the architecture / deployment, component responsibility, Source of Truth,
  lifecycle writer, outcome, polling, startup, and poll-to-execution boundaries
  are mutually consistent;
- the v0.3.0 `Ready for Agent` meaning, Human Review, Handler Validation,
  approval metadata, and requirements fingerprint semantics remain unchanged;
- Agent Controller consumes approval facts but does not become an approval
  lifecycle writer;
- requirements revalidation reuses the existing v0.3.0 semantics rather than a
  Runner-specific duplicate specification;
- each durable information category has one authoritative Source of Truth;
- pre-execution validation failure and durable `Agent Running` mutation failure
  both stop before Agent start;
- Phase 45 does not implement or fix the detailed schemas / algorithms owned by
  Phase 46 through Phase 50; and
- Phase 46 can begin execution eligibility / input-contract work without an
  additional architecture decision.

The seven Phase 45 parent completion criteria are evidenced as follows:

| Parent completion criterion | Canonical evidence | Decision evidence |
| --- | --- | --- |
| Architecture / Deployment Boundary | `Architecture / Deployment Boundary`, `Release Ownership` | ADR-024 |
| Component Responsibility | `Component Responsibility` | canonical contract |
| Source of Truth Boundary | `Source of Truth Boundary`, `Durable / Transient State Boundary`, `Runtime Queue Boundary` | ADR-025 |
| Lifecycle Write Ownership | `Lifecycle Write Ownership`, `Pre-execution Failure Boundary` | ADR-026 |
| Execution Outcome Taxonomy | `Execution Outcome Taxonomy` | ADR-026 |
| Polling / Startup Contract | `Polling Contract`, `Startup Contract`, `Poll-to-Execution Boundary` | ADR-027 |
| v0.3.0 Handoff / later Phase boundary | `v0.3.0 Handoff Compatibility`, `Phase 46-50 Responsibility Boundary` | v0.3.0 handoff contract + ADR-024 through ADR-027 |

The architecture decision rationales for the complete Phase 45 boundary are
recorded in:

- `docs/adr/ADR-024-separate-agent-runner-execution-plane.md`
- `docs/adr/ADR-025-use-redmine-as-durable-execution-source-of-truth.md`
- `docs/adr/ADR-026-separate-approval-and-execution-lifecycle-writers.md`
- `docs/adr/ADR-027-use-pull-based-single-worker-agent-controller.md`
