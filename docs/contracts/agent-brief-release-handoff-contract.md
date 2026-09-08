# Agent Brief v0.3.0 Release Handoff Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the Phase 43-1 release handoff boundary for the Agent Brief
workflow after Phases 35 through 42 are complete.

The v0.3.0 functional boundary ends at `Ready for Agent`. At that point one
human-reviewed Agent Brief has passed Handler Validation, the approval fact is
persisted consistently, and a later execution layer has enough immutable
identity and requirements evidence to retrieve and revalidate the approved
artifact.

This contract does not redesign the lifecycle, persistence, fingerprint,
approval, idempotency, or public MCP contracts. It consolidates their final
handoff obligations for the v0.3.0 release boundary.

The domain source contracts remain authoritative for their own rules:

- `docs/contracts/agent-brief-persistence-contract.md`
- `docs/contracts/agent-brief-lifecycle-contract.md`
- `docs/contracts/agent-brief-redmine-mapping-contract.md`
- `docs/contracts/agent-brief-requirements-fingerprint-contract.md`
- `docs/contracts/agent-brief-approval-handler-contract.md`
- `docs/contracts/agent-brief-approval-idempotency-recovery-contract.md`
- `docs/contracts/agent-brief-public-mcp-surface-contract.md`

This document is authoritative only for the release-level meaning of
`Ready for Agent`, the minimum handoff evidence, and the boundary between
v0.3.0 and later Agent execution responsibilities.

## Release boundary

The v0.3.0 workflow boundary is:

```text
Brief Draft
    |
    | Human Review completed and Handler Validation requested
    v
Brief Ready
    |
    | Handler Validation succeeds for the reviewed immutable artifact
    | and required approval metadata is stored consistently
    v
Ready for Agent
    |
    +---- v0.3.0 functional boundary ----
    |
    v
future Agent claim / execution layer
```

`Ready for Agent` is the final functional lifecycle state introduced by v0.3.0.

It means the Issue is eligible for handoff to a later execution system. It does
not mean that an Agent has been selected, claimed the work, received a
workspace, started execution, produced code, pushed source, waited for CI, or
opened a Pull Request.

## Human Review and Handler Validation boundary

Human Review and Handler Validation remain separate responsibilities.

Human Review establishes that a human accepts one concrete persisted Brief
revision as the candidate to validate. Human Review alone does not grant
handoff eligibility.

`Brief Ready` records that Human Review has completed and Handler Validation has
been requested for that reviewed immutable reference. The validation-pending
interval remains `Brief Ready`; it is not execution permission.

Handler Validation establishes the machine-checkable conditions required for
handoff. It validates the exact reviewed artifact and current requirements
through the existing Phase 37 through Phase 40 boundaries.

Only a final state that satisfies the existing lifecycle and approval
consistency contracts may be interpreted as `Ready for Agent`.

A direct transition from `Brief Draft` to `Ready for Agent` remains forbidden.

## What `Ready for Agent` guarantees

When `Ready for Agent` is established successfully, the following facts have
been proven for one exact approval target:

- Human Review completed for one concrete persisted Agent Brief;
- Handler Validation accepted that same persisted artifact;
- the persisted Brief identity matched the reviewed Issue, repository, Brief
  revision, and persisted revision;
- requirements fingerprint generation and comparison succeeded;
- the approved requirements fingerprint represented a `CURRENT` result at the
  approval/reconciliation point;
- the lifecycle is `Ready for Agent`;
- the complete approval record is present and internally consistent;
- the approval record identifies the same Brief revision and persisted revision
  that Handler Validation accepted;
- the persisted Brief can be recovered from versioned Brief storage without
  guessing a mutable "latest" artifact;
- handoff eligibility is true according to the existing lifecycle contract.

An exact already-completed approval reconciled under Phase 41 carries the same
guarantees. Reconciliation preserves the original approval fact rather than
creating a new one.

## What `Ready for Agent` does not guarantee

`Ready for Agent` does not guarantee any later runtime fact.

In particular, it does not guarantee:

```text
queue membership
claim
lease
heartbeat
worker allocation
workspace allocation
Agent selection
Agent execution
source-code mutation
source-code commit or push
CI wait or retry
Pull Request creation
deployment
```

It also does not guarantee that Redmine requirements remain unchanged forever
after approval.

The approval proves that the reviewed Brief and current requirements matched at
the successful approval or exact reconciliation point. Requirements may change
before a later execution layer begins work.

## Minimum handoff evidence

A later execution layer must be able to establish the following logical handoff
record from the Redmine Issue, canonical configuration, and versioned Brief
storage:

| Handoff value | Source of truth | Meaning |
| --- | --- | --- |
| `repository` | configured Phase 37 persistence boundary / validated Brief identity | Repository containing the approved versioned Brief and implementation target. |
| `redmine_issue_id` | Redmine Issue | Issue whose requirements and lifecycle are authoritative. |
| `brief_revision` | `approved_brief_revision` approval metadata | Human-reviewed Brief revision accepted by Handler Validation. |
| `persisted_revision` | `approved_persisted_revision` approval metadata | Opaque immutable Phase 37 revision identifying the exact approved Brief bytes. |
| `requirements_fingerprint` | `approved_requirements_fingerprint` approval metadata | Fingerprint proven current at approval/reconciliation time. |
| `approver_identity` | approval metadata | Stable Redmine principal identity associated with the human approval fact. |
| `approved_at` | approval metadata | Timestamp associated with the explicit human approval fact. |

The physical Redmine custom-field names and environment-specific IDs remain
owned by `agent-brief-redmine-mapping-contract.md`; this contract does not
duplicate or replace that mapping.

`approved_at` keeps its existing meaning. It is the approval fact's timestamp,
not a later Handler retry time, Agent start time, or Issue `updated_on` value.

## Handoff identity

The immutable artifact identity used for handoff is the existing Phase 37 tuple:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

The Issue supplies `redmine_issue_id`.

The complete approval record supplies the approved Brief revision and approved
persisted revision.

The repository is resolved from the configured Phase 37 persistence boundary
and must agree with the stored Brief identity. A consumer must not guess the
repository from a display name, arbitrary path, mutable branch name, or unrelated
Redmine field.

`requirements_fingerprint`, `approver_identity`, and `approved_at` are handoff
evidence associated with that immutable artifact identity. They do not replace
the identity tuple.

## Artifact recovery obligation

A later consumer must fail closed unless it can recover and validate the exact
approved artifact.

Conceptually:

```text
read latest Redmine Issue
    |
    v
require lifecycle == Ready for Agent
    |
    v
require complete syntactically valid approval metadata
    |
    v
resolve configured repository
    |
    v
derive exact Phase 37 artifact identity
    |
    v
read exact brief_revision
    |
    v
verify persisted_revision and stored Brief identity
    |
    v
verify stored Brief requirements_fingerprint agrees with approved metadata
    |
    v
handoff artifact established
```

The consumer must not silently substitute:

- the numerically latest Brief revision;
- a mutable `current` or `latest` file;
- another repository;
- another persisted revision;
- partially populated approval metadata.

If the lifecycle, metadata, storage identity, or stored artifact does not agree,
the Issue is not a valid execution handoff even if one field says
`Ready for Agent`.

## Requirements revalidation before execution

A later Agent execution layer must not treat a historical `Ready for Agent`
decision as proof that requirements are still current at execution time.

Before execution begins, the later layer must be able to reuse the existing
requirements-validation responsibilities:

```text
latest Redmine requirements
    |
    v
Phase 36 bounded generation-input semantics
    |
    v
Phase 39 canonical fingerprint
    |
    v
compare with approved requirements_fingerprint
```

The result has the following handoff meaning:

```text
current fingerprint == approved requirements_fingerprint
  -> the approved Brief remains requirements-current
  -> later execution-specific gates may continue

current fingerprint != approved requirements_fingerprint
  -> the approved Brief is stale for execution
  -> do not start Agent execution
  -> Human Review / approval must be re-established before later execution
```

A fingerprint-generation failure is neither CURRENT nor STALE. The later layer
must fail closed rather than fall back to `updated_on`, timestamps, or another
informal freshness signal.

Phase 43-1 does not introduce an automatic polling loop, webhook, background
revalidator, or a new public lifecycle mutation Tool.

A later release may define how an execution-time stale result is persisted or
routed back into the existing review workflow. That runtime orchestration is not
part of v0.3.0.

## Source-of-truth boundary

The release handoff preserves the existing source-of-truth split:

```text
Redmine
  -> current requirements
  -> priority and business state
  -> Agent Brief lifecycle
  -> approval metadata

Versioned Brief storage
  -> Brief content
  -> Brief revision history
  -> immutable persisted-revision identity

Future Agent runtime layer
  -> queue / claim / lease / heartbeat
  -> workspace and execution state
  -> Agent output
  -> CI / Pull Request / deployment runtime state
```

No runtime state is added to Redmine approval metadata or versioned Brief
storage by this contract.

## Handoff eligibility checks

A consumer may treat an Issue as eligible for later Agent handoff only when all
of these conditions hold:

1. lifecycle is exactly `Ready for Agent`;
2. all five existing approval metadata values are present and valid;
3. repository identity resolves unambiguously;
4. the exact approved Brief revision exists;
5. the persisted revision matches the exact approved artifact;
6. stored Issue/repository/revision identity matches the handoff identity;
7. the stored Brief requirements fingerprint matches approved metadata.

Any inconsistency fails closed.

`Brief Draft` and `Brief Ready` are never handoff eligible.

Stale or partial approval-looking custom fields in a non-eligible lifecycle do
not grant execution permission.

## Approval fact preservation

A handoff consumer treats approval metadata as an existing approval fact, not as
values it may rewrite for convenience.

In particular:

- `approver_identity` is the persisted approver of record;
- `approved_at` is the persisted approval timestamp;
- `brief_revision` and `persisted_revision` identify the approved artifact;
- `requirements_fingerprint` records the requirements proof associated with the
  approval.

A later handoff or execution attempt must not replace these values merely to
record claim time, execution start time, retry time, or worker identity.

Those are runtime facts and require a separate later contract.

## Security boundary

Handoff discovery does not create a new permission boundary.

Existing security responsibilities remain authoritative:

- Redmine reads/writes use the configured credential boundary;
- lifecycle/approval mutations remain behind the existing Write Guard and
  allowed-project boundary;
- versioned Brief persistence remains restricted to the Phase 37 repository-local
  storage boundary;
- no generic Redmine custom-field writer is introduced;
- no generic Git/source writer is introduced;
- credentials and configured secrets must not appear in handoff artifacts,
  responses, logs, or diagnostics.

A future Agent runtime layer requires its own least-privilege write and execution
permissions. `Ready for Agent` does not implicitly grant those permissions.

## v0.3.0 out of scope

The following are explicitly outside this release handoff contract:

```text
automatic Brief Generator service
Brief Requested triggered automation
Redmine Webhook / polling automation
Agent Controller
Worker orchestration
workspace provisioning
claim / lease / heartbeat
Agent execution
Codex / Claude Code automatic execution
Agent source-code commit or push
CI failure retry automation
Pull Request automation
deployment automation
```

No field, state, API, Tool, queue, or storage representation for these
responsibilities is introduced by Phase 43-1.

## Compatibility boundary

This contract does not change the public MCP request or response schema.

The existing explicit approval Tool remains the Phase 40/41 operation. Its
successful `approved` response is an immediate public representation of the
same logical handoff fact, including:

```text
issue_id
brief_revision
persisted_revision
requirements_fingerprint
lifecycle = Ready for Agent
approver_identity
approved_at
handoff_eligible = true
```

Later consumers are not required to depend on one prior MCP response remaining
in memory. The durable handoff fact must be reconstructible from Redmine,
canonical repository configuration, and versioned Brief storage.

A future release that adds Agent claim/execution state, changes the handoff
identity, changes approval metadata semantics, or changes execution-time
requirements validation requires an explicit contract/ADR review.

## Verification obligations

Phase 43-1 completion requires repository and Roadmap evidence that:

- Human Review and Handler Validation remain distinct;
- `Brief Ready` remains validation-pending and non-handoff-eligible;
- only `Ready for Agent` plus complete consistent approval metadata grants
  handoff eligibility;
- the exact approved Brief is recoverable through the Phase 37 immutable
  reference;
- the approved requirements fingerprint is available to a later consumer;
- requirements validation can be repeated before future execution without using
  `updated_on` as a freshness shortcut;
- runtime execution state is not stored in the v0.3.0 approval/handoff model;
- the `030_ロードマップ` release boundary and this repository contract describe the
  same responsibility boundary.

Existing Phase 37 through Phase 42 unit, integration, E2E, security, and Context
Budget verification remains the executable evidence for the underlying domain
behavior. Phase 43-1 does not create a second implementation of those rules.
