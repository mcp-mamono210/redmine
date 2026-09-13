# Agent Runner Execution Input Contract

Status: Draft for unreleased v0.4.0  
Target release: v0.4.0

## Purpose / Scope

This document is the canonical Phase 46 contract for the execution input boundary
between the existing `Ready for Agent` handoff and later Agent Runner execution.

Phase 46-1 establishes the initial contract for:

- base execution eligibility;
- exact approved Agent Brief recovery;
- immutable handoff identity validation;
- repository identity resolution; and
- fail-closed behavior before later execution-specific checks.

Later Phase 46 tickets extend this same canonical document with requirements
revalidation, pre-execution rejection semantics, exact source revision,
execution identity, immutable execution input snapshot, logical execution record,
physical Redmine mapping, environment binding, and final cross-contract
verification.

This contract is subordinate to the Phase 45 architecture / lifecycle boundary:

```text
docs/contracts/agent-runner-execution-boundary-contract.md
```

The upstream v0.3.0 handoff meaning remains authoritative in:

```text
docs/contracts/agent-brief-release-handoff-contract.md
```

Phase 46 consumes those contracts. It does not redefine `Ready for Agent`, Human
Review, Handler Validation, approval metadata, Brief persistence identity, or
requirements-fingerprint semantics.

Phase 46-1 does not implement Agent execution. It does not define requirements
revalidation, exact application source revision, `execution_id`, execution
record persistence, Redmine execution-field mapping, repository authorization,
credentials, sandboxing, or Agent process invocation.

## Execution Eligibility

A candidate is eligible to continue beyond the Phase 46-1 handoff-validation
boundary only when all of the following conditions are established:

```text
Agent Brief lifecycle == Ready for Agent

approval metadata is complete and syntactically valid

approved Brief revision is valid

approved persisted revision is valid

repository identity resolves unambiguously

exact approved Brief is retrievable

stored Brief identity agrees with the approved handoff identity

stored Brief requirements fingerprint agrees with approved metadata
```

`Ready for Agent` above means the logical Agent Brief lifecycle defined by the
existing v0.3.0 lifecycle / Redmine mapping contracts. It does not mean the
ordinary Redmine Issue Status has been renamed or overloaded with that value.

The complete approval record is the existing five-value approval fact:

```text
approver_identity
approved_at
approved_brief_revision
approved_persisted_revision
approved_requirements_fingerprint
```

Phase 46-1 validates that those values are present, syntactically valid, and
consistent with the approved artifact. It must not rewrite them to record any
execution-time fact.

This eligibility check intentionally does not assert that current Redmine
requirements are still equal to the approved requirements fingerprint. Current
requirements revalidation is a separate Phase 46-2 responsibility.

Likewise, this phase does not prove that the repository is authorized for Agent
execution. It proves only that the repository identity required by the handoff
can be resolved unambiguously. Repository authorization belongs to Phase 47.

## Approved Brief Recovery

The exact approved Brief must be recovered through the existing immutable
handoff identity and approval evidence.

The immutable artifact identity is:

```text
repository
redmine_issue_id
brief_revision
persisted_revision
```

The associated approval evidence is:

```text
requirements_fingerprint
approver_identity
approved_at
```

The logical recovery sequence is:

```text
read the current Redmine Issue
    |
    v
require Agent Brief lifecycle == Ready for Agent
    |
    v
require complete valid approval metadata
    |
    v
resolve the configured repository identity unambiguously
    |
    v
derive the exact approved Brief identity
    |
    v
read the exact brief_revision from versioned Brief storage
    |
    v
verify persisted_revision identifies the returned stored artifact
    |
    v
verify stored Issue / repository / revision identity
    |
    v
verify stored Brief requirements fingerprint agrees with approval metadata
    |
    v
approved Brief recovery established
```

`persisted_revision` remains the opaque immutable storage identity defined by the
v0.3.0 persistence contract. Phase 46 must not assume a Git hash algorithm,
commit-SHA representation, or fixed object-ID length for that value.

Recovery is exact-artifact recovery. A consumer must not substitute or infer an
artifact from any mutable convenience reference, including:

```text
latest Brief
latest revision
current file
current.md
latest.md
mutable branch
branch HEAD
```

The numerically newest Brief revision is not automatically the approved Brief.
The approved `brief_revision` and `persisted_revision` from the durable approval
fact select the artifact to recover.

## Handoff Identity Validation

The recovered artifact is valid for this handoff only when the same logical
identity is preserved across Redmine approval metadata, configured repository
identity, and versioned Brief storage.

At minimum, validation must establish all of the following:

1. the Redmine Issue supplying the handoff is the same `redmine_issue_id` stored
   in the recovered Brief;
2. the configured repository identity resolves exactly once and matches the
   recovered Brief `repository` identity;
3. the approved Brief revision equals the recovered Brief revision;
4. the approved persisted revision identifies the exact recovered stored
   artifact;
5. the recovered Brief requirements fingerprint agrees with
   `approved_requirements_fingerprint`;
6. the complete approval record remains internally consistent with the same
   approved artifact; and
7. the lifecycle remains exactly `Ready for Agent` while this handoff validation
   is evaluated.

The repository must not be guessed from a display name, arbitrary filesystem
path, unrelated Redmine field, or mutable branch name.

The approval evidence is read-only execution input. Phase 46-1 must not replace:

```text
approver_identity
approved_at
approved_brief_revision
approved_persisted_revision
approved_requirements_fingerprint
```

with Agent claim time, Agent start time, retry time, Worker identity, current
branch state, or another runtime fact.

Human Review and Handler Validation remain completed upstream responsibilities.
Phase 46-1 validates their durable result; it does not perform either operation
again and does not redefine their semantics.

## Repository Responsibility Boundary

Phase 46-1 owns repository identity resolution only.

Its responsibility is to establish:

```text
repository identity is present
+
repository identity is canonical for the handoff
+
repository identity resolves unambiguously
+
repository identity agrees with the stored Brief
```

The following are Phase 47 security responsibilities and are not defined by
Phase 46-1:

```text
repository allowlist
repository authorization policy
credential authorization
checkout credential policy
sandbox / filesystem policy
network policy
```

Repository identity resolution does not grant execution permission.

A later execution attempt must also pass the Phase 47 authorization / security
gate before the execution attempt is established. Phase 46-1 fixes that
prerequisite only. Later Phase 46 sections define the detailed ordering around
exact source revision, execution identity allocation, execution snapshot, and
`Agent Running` mutation.

## Fail-closed Boundary

Phase 46-1 uses fail-closed eligibility semantics:

```text
unknown
!=
valid
```

The candidate must not continue beyond this boundary when any required fact is
missing, ambiguous, malformed, unavailable, or inconsistent.

At minimum, the following conditions fail closed:

```text
lifecycle is not Ready for Agent
lifecycle cannot be established
approval metadata is incomplete
approval metadata is syntactically invalid
repository identity is missing
repository identity is ambiguous
exact approved Brief cannot be retrieved
brief_revision does not match
persisted_revision does not match
stored Issue identity does not match
stored repository identity does not match
stored requirements fingerprint does not match approved metadata
```

A failure must not be repaired by selecting another Brief revision, another
repository, a mutable `latest` artifact, a different persisted revision, or a
fallback freshness signal.

Phase 46-1 does not yet define the durable pre-execution rejection record,
`stale_requirements` / `eligibility_failed` routing details, or physical Redmine
mapping for such a failure. Those are later Phase 46 responsibilities. The
Phase 46-1 guarantee is narrower: a failed or unknown check is not execution
permission and must not be treated as a successful handoff to an Agent
execution attempt.

Diagnostics produced by an implementation of this boundary must not contain
credentials, API keys, repository secrets, or other configured secret values.

## Approval Contract Preservation

Phase 46-1 is a consumer of the existing approval fact.

It must preserve all of the following upstream meanings:

- Human Review and Handler Validation are separate responsibilities;
- `Brief Ready` is not execution permission;
- `Ready for Agent` is the approved handoff state;
- approval metadata identifies the existing human approval fact;
- `approved_at` remains the human approval timestamp;
- `approver_identity` remains the persisted approver identity;
- `approved_brief_revision` and `approved_persisted_revision` identify the exact
  approved artifact; and
- `approved_requirements_fingerprint` remains the requirements proof recorded at
  approval / reconciliation time.

Phase 46-1 must not create a second approval interpretation or write surface.

## Deferred Phase 46 Responsibilities

This initial Phase 46-1 revision deliberately leaves the following work to the
later child tickets that own it:

```text
Phase 46-2
  current requirements revalidation
  pre-execution rejection semantics
  stale_requirements / eligibility_failed routing

Phase 46-3
  exact application source revision
  execution identity semantics
  execution_id allocation boundary

Phase 46-4
  Phase 47 gate placement in the final ordering
  immutable execution input snapshot
  logical execution record
  Agent Running durable mutation boundary

Phase 46-5
  Redmine capability inventory
  physical execution-record mapping
  environment-specific ID binding
  execution_id serialization
  required manual field provisioning

Phase 46-6
  final v0.3.0 / Phase 45 / Roadmap consistency verification
  documentation precedence
  Phase 47 / Phase 48 entry verification
```

Deferring these responsibilities is intentional. Phase 46-1 must not preempt
their detailed contracts merely to make this first revision appear complete.

## Verification Obligations

Phase 46-1 is complete only when repository evidence demonstrates that:

- this canonical Phase 46 contract exists;
- eligibility is fail closed;
- `Ready for Agent` is required and retains its v0.3.0 meaning;
- all existing approval metadata required by the handoff is validated for
  completeness and syntax;
- the exact approved Brief is recovered through the immutable handoff identity;
- a mutable `latest` artifact is never substituted for the approved artifact;
- repository identity is resolved unambiguously and agrees with the stored
  Brief;
- repository authorization remains a Phase 47 responsibility;
- Phase 47 authorization / security success remains a prerequisite for a later
  execution attempt; and
- Human Review, Handler Validation, and approval metadata semantics are consumed
  without redefinition.

No Agent runtime test is required by Phase 46-1 because this ticket establishes
an execution-input contract boundary rather than the runtime implementation.
