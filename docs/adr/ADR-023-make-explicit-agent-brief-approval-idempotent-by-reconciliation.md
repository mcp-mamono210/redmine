# ADR-023: Make explicit Agent Brief approval idempotent by reconciliation

Status: Accepted  
Date: 2026-09-07

## Context

ADR-022 introduced one narrow public MCP write Tool,
`redmine_approve_agent_brief`, and intentionally left duplicate-request
idempotency and interrupted-write recovery to Phase 41.

Phase 40 is safe for one explicit approval attempt, but a completed approval
moves the lifecycle from `Brief Ready` to `Ready for Agent`. Repeating the same
request therefore cannot be treated as a fresh Phase 40 approval attempt.

Redmine writes also have an unavoidable distributed-systems ambiguity: a client
may lose the response after Redmine committed the write. Blindly retrying can
rewrite approval metadata or produce a conflict, while treating every transport
failure as a failed write can report a false failure for a completed approval.

The repository already has strong reusable identities and boundaries:

- Phase 37 provides repository / Issue / Brief revision / persisted revision;
- Phase 38 provides lifecycle, approval metadata, guarded writes, and handoff
  eligibility;
- Phase 39 provides deterministic requirements fingerprints and staleness;
- Phase 40 provides the explicit approval Tool and approval orchestration.

The remaining design choice is whether Phase 41 should introduce a separate
idempotency token / operation journal, a new duplicate-specific public result,
or converge repeated requests by reconciling the existing source-of-truth
state.

## Decision

Use source-of-truth reconciliation rather than a new caller-supplied
idempotency token or durable operation journal for v0.3.0.

The logical approval identity is:

```text
(repository, issue_id, brief_revision, persisted_revision)
```

The approved requirements fingerprint is mandatory reconciliation evidence but
is derived from trusted state rather than caller input.

A duplicate request for an already-completed exact target returns the existing
`approved` public outcome using the already-persisted approval metadata. It does
not create a second approval fact and does not replace `approved_at`.

Keep the existing public request schema and successful top-level outcomes:

```text
approved
stale
validation_failed
```

Add one validation reason for a clean state mismatch:

```text
approval_conflict
```

When Phase 41 implementation is active, mark the existing Tool with:

```text
idempotentHint = true
```

For an ambiguous Redmine write outcome, reconcile current state before any
retry. Classify read-back as completed, unchanged/retryable, conflict, stale, or
unresolved.

Permit at most one recovery write after the initial attempt. The recovery write
is allowed only after read-back proves the original write did not take effect
and the exact approval preconditions still hold. Revalidate target identity,
staleness, lifecycle, Write Guard, and project authorization before that retry.

After the optional recovery write, perform a final read-back. If final state
cannot be established safely, return an application error. Do not run a third
write in the same explicit invocation.

Do not add a background worker, webhook/polling loop, durable retry queue,
caller-supplied retry token, or Agent execution behavior in Phase 41.

The exact contract is defined in
`docs/contracts/agent-brief-approval-idempotency-recovery-contract.md`.

## Consequences

Repeated exact approval requests converge on the existing Redmine approval fact
instead of creating duplicate approval metadata.

Clients do not need to manufacture or persist a second idempotency-key
namespace; the human-reviewed immutable Brief reference remains the operation
identity.

The public request shape remains stable. Public output also remains compact;
clients still handle `approved`, `stale`, and `validation_failed` rather than a
new duplicate-specific success type.

`approved_at` retains its meaning as the original explicit human approval time,
not a later retry or recovery timestamp.

Transport uncertainty no longer implies blind retry. Current Redmine / Brief
state is authoritative for deciding whether the write completed.

The one-retry bound prevents unbounded synchronous mutation loops while still
allowing recovery from one confirmed unchanged transient failure.

A mismatched or partial `Ready for Agent` state fails closed instead of being
silently adopted as idempotent success.

Changing the approval identity tuple, adding a public caller-supplied
idempotency key, introducing additional successful outcome variants, or adding a
durable background recovery mechanism requires a future explicit contract / ADR
change.
