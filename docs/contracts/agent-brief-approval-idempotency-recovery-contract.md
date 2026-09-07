# Agent Brief Approval Idempotency / Recovery Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines Phase 41 idempotency, duplicate-approval reconciliation,
ambiguous-write recovery, and bounded retry semantics for the explicit Agent
Brief approval workflow introduced in Phase 40.

Phase 41 extends the existing `redmine_approve_agent_brief` workflow. It does
not introduce a second approval entry point, a generic lifecycle mutation Tool,
a generic custom-field write Tool, a background worker, webhook processing, or
Agent execution.

Phase responsibilities remain:

- Phase 37 owns immutable Brief persistence and persisted-revision identity;
- Phase 38 owns lifecycle / approval metadata mapping and guarded writes;
- Phase 39 owns requirements fingerprint generation and staleness detection;
- Phase 40 owns approval business orchestration and the explicit public MCP Tool;
- Phase 41 owns duplicate-request convergence and interrupted / ambiguous write
  recovery around that Phase 40 operation.

## Approval target identity

The logical idempotency identity for one approval target is the tuple:

```text
(repository, issue_id, brief_revision, persisted_revision)
```

where:

- `repository` comes from the configured Phase 37 persistence boundary;
- `issue_id` is the Redmine Issue identifier from the public request;
- `brief_revision` is the human-reviewed Agent Brief revision;
- `persisted_revision` is the opaque immutable persisted revision returned by
  the Phase 37 persistence boundary.

The public request does not gain a caller-supplied idempotency key.

The current / approved requirements fingerprint is not part of the logical
identity tuple because it is derived from trusted application state rather than
caller input. It is nevertheless mandatory reconciliation evidence: a completed
approval may be considered the same approval only when its stored approved
requirements fingerprint agrees with the fingerprint that belongs to the exact
persisted Brief / requirements state being reconciled.

## Public MCP contract decision

Phase 41 keeps the existing public Tool name and request schema unchanged:

```text
redmine_approve_agent_brief
```

```json
{
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>"
}
```

Phase 41 also keeps the existing successful public outcome variants unchanged:

```text
approved
stale
validation_failed
```

No new `duplicate`, `replayed`, `recovered`, or retry-token field is added to
v0.3.0 public output.

Idempotency is expressed by convergence on the same existing domain outcome:

- a duplicate request for an already-completed exact approval target returns
  `approved` using the already-persisted approval metadata;
- a request that is still stale returns `stale` after proving the requested
  Brief remains non-handoff-eligible;
- a clean conflict or invalid precondition returns `validation_failed` when it
  can be classified before a new write;
- an outcome that cannot be established safely remains an application error and
  is never converted into a successful domain result.

Once Phase 41 implementation is present, the Tool annotation becomes:

```text
readOnlyHint = false
destructiveHint = false
idempotentHint = true
openWorldHint = true
```

This annotation change is a public contract change and must be implemented with
matching Tool-registry / regression coverage in Phase 41-2 or Phase 41-3.

## Already-approved reconciliation

A request may be treated as an idempotent duplicate of a completed approval only
when current read-back proves all of the following:

```text
lifecycle == Ready for Agent
handoff_eligible == true
approval metadata complete
approved_brief_revision == request.brief_revision
approved_persisted_revision == request.persisted_revision
repository identity == configured repository
Issue identity == request.issue_id
approved_requirements_fingerprint == persisted/current requirements fingerprint
```

If these conditions hold, the operation returns the normal `approved` response
using the existing approval metadata. In particular:

- `approver_identity` is the original persisted approver identity;
- `approved_at` is the original persisted approval timestamp;
- no lifecycle write occurs;
- no approval metadata is rewritten;
- no new approval timestamp is captured to replace the original approval fact.

A duplicate request therefore converges on the same approval fact rather than
creating a second approval.

## Conflict semantics

A request MUST NOT be treated as an idempotent duplicate when any of the
following is true:

- Issue identity differs;
- repository identity differs;
- requested Brief revision differs from approved metadata;
- requested persisted revision differs from approved metadata;
- approval metadata is incomplete;
- approved requirements fingerprint is missing, malformed, or inconsistent;
- `Ready for Agent` is present but handoff eligibility is false;
- the current Issue / Brief state cannot prove that the stored approval belongs
  to the exact requested target.

A clean pre-write mismatch is a validation failure. Phase 41 adds one public
validation reason:

```text
approval_conflict
```

The full v0.3.0 `validation_failed.reason` set after Phase 41 implementation is:

```text
lifecycle_not_brief_ready
reviewed_reference_invalid
fingerprint_unavailable
approval_conflict
```

`approval_conflict` MUST NOT be used for transport uncertainty, backend
unavailability, or a write whose completion cannot be established.

## Stale re-execution

A previous stale handling result must not become an approval success merely
because the same request is retried.

When the lifecycle is `Brief Draft`, Phase 41 may reconcile the exact requested
persisted Brief against current requirements. If the persisted and current
fingerprints are available and remain unequal, the operation returns the normal
`stale` outcome without transitioning to `Ready for Agent`.

If requirements have changed again such that the previously stale target can no
longer be safely classified from the exact persisted reference, the operation
must return a clean validation failure when possible or an application error if
state cannot be established. It MUST NOT silently move `Brief Draft` to
`Ready for Agent`.

A new approval after requirements change still requires the normal lifecycle:

```text
Brief Draft
  -> Human Review
Brief Ready
  -> Handler Validation
Ready for Agent
```

## Ambiguous write outcome

An ambiguous write outcome is a write attempt for which the caller cannot know
from the transport response alone whether Redmine committed the intended
lifecycle / approval metadata mutation.

Examples include timeout, connection loss, or response loss after the request
may have reached Redmine.

An ambiguous outcome is never immediately retried. The mandatory first step is
read-back reconciliation.

```text
write attempt
   |
   +-- confirmed success -> normal Phase 40 read-back
   |
   +-- confirmed failure before mutation -> application error or retry path
   |
   `-- outcome unknown -> read current lifecycle / metadata first
```

## Read-back recovery classification

After an ambiguous write, Phase 41 classifies current state as one of:

```text
COMPLETED
UNCHANGED_RETRYABLE
CONFLICT
STALE
UNRESOLVED
```

### COMPLETED

Use when the intended final state is already fully present for the exact
approval target.

For approval this means the same conditions as already-approved reconciliation:
`Ready for Agent`, complete exact metadata, correct fingerprint, and handoff
eligibility.

No new write occurs. Return `approved` with persisted original approval metadata.

### UNCHANGED_RETRYABLE

Use only when read-back proves the original intended write did not take effect
and the preconditions for the exact target still hold.

At minimum:

- lifecycle remains `Brief Ready` for an approval write;
- no conflicting approval metadata has appeared;
- the exact persisted Brief reference is still valid;
- Phase 39 still reports `CURRENT` for that exact target;
- Write Guard / project authorization still allow the mutation.

### CONFLICT

Use when current state contains a different or partial approval fact, target
mismatch, inconsistent metadata, or another state that cannot be safely treated
as either completed or unchanged.

A conflict is not retryable and must not be reported as approval success.

### STALE

Use when exact reconciliation proves current requirements no longer match the
persisted Brief. The target must not proceed to `Ready for Agent`.

### UNRESOLVED

Use when read-back itself fails or does not provide enough evidence to classify
state safely. An unresolved state is an application error and must not be
reported as `approved`, `stale`, or a clean validation result.

## Bounded retry

Phase 41 allows at most one additional Redmine write attempt after the initial
write attempt.

The bound is therefore:

```text
maximum writes per explicit MCP invocation = 2

write #1 = initial Phase 40 write attempt
write #2 = optional recovery retry
```

The recovery retry is permitted only after read-back classifies the state as
`UNCHANGED_RETRYABLE`.

Before write #2, the operation MUST revalidate:

- exact Issue / repository / Brief revision / persisted revision identity;
- current lifecycle;
- approval metadata absence / non-conflict;
- current requirements fingerprint / staleness;
- Write Guard and allowed-project authorization.

After write #2, a final read-back is mandatory.

There is no write #3 in one explicit invocation. If final state is not safely
classifiable after the recovery retry, the operation returns an application
error. The caller may make a later explicit request, which again starts by
reconciling current state rather than assuming the previous invocation failed.

Phase 41 does not introduce sleeps, background retry loops, a durable retry
queue, or an unbounded timeout loop.

## Approval timestamp and approver preservation

Idempotent reconciliation and recovery must preserve already-recorded approval
facts.

If read-back proves the exact approval is already completed:

- preserve existing `approver_identity`;
- preserve existing `approved_at`;
- preserve existing approved Brief revision;
- preserve existing approved persisted revision;
- preserve existing approved requirements fingerprint.

A retry timestamp is not an approval timestamp.

A recovery path must not overwrite an existing exact approval merely to make a
second request appear newly approved.

If the initial write is proven not to have committed and the state is
`UNCHANGED_RETRYABLE`, the one recovery write uses the original approval attempt
facts from the same explicit invocation. It does not synthesize a second human
approval event.

## Application errors

The existing bounded / sanitized application-error path remains authoritative.

The following are application errors rather than clean domain outcomes:

- read-back unavailable after an ambiguous write;
- retry bound exhausted without a safely established final state;
- unexpected persistence / Redmine backend failure;
- Write Guard / authorization failure;
- inability to resolve the authenticated approval principal when a new approval
  is still required;
- internal contract violation;
- any state classified as `UNRESOLVED`.

Errors must not include API keys, Authorization values, raw Redmine response
bodies, stack traces, configured secrets, or nested exception causes.

## No duplicated business logic

Phase 41 extends orchestration around the Phase 40 Handler and existing Phase
37-39 boundaries. It must not create a second independent implementation of:

- persisted Brief validation;
- requirements fingerprint generation;
- staleness comparison;
- lifecycle mapping;
- custom-field writes;
- Write Guard / allowed-project authorization.

Reconciliation may compare the trusted outputs of those boundaries, but must not
reimplement their source-of-truth rules in the MCP adapter.

## Phase 41-2 / Phase 41-3 responsibility split

Phase 41-2 owns:

- duplicate request detection;
- already-approved exact reconciliation;
- deterministic reuse of the existing `approved` outcome;
- approval-conflict classification;
- preservation of original approval metadata;
- delegation of new `Brief Ready` approval work to the Phase 40 Handler.

Phase 41-3 owns:

- ambiguous write detection;
- mandatory read-back recovery;
- `COMPLETED / UNCHANGED_RETRYABLE / CONFLICT / STALE / UNRESOLVED`
  classification after uncertain writes;
- one bounded recovery retry;
- retry exhaustion behavior;
- fault-injection integration / E2E coverage.

## Regression obligations

Phase 41 implementation must add executable coverage proving at least:

- exact duplicate completed approval returns the normal `approved` outcome;
- duplicate reconciliation does not write or replace `approved_at`;
- revision / persisted-revision / fingerprint mismatch is not duplicate success;
- incomplete approval metadata is not duplicate success;
- `approval_conflict` is distinct from transport / unresolved application error;
- stale re-execution never moves a Brief to `Ready for Agent`;
- ambiguous write is reconciled before any retry;
- confirmed completed write is not written again;
- only `UNCHANGED_RETRYABLE` may perform the one recovery retry;
- a maximum of two writes occur per explicit invocation;
- retry exhaustion / unresolved state is never reported as approval success;
- Write Guard / project allowlist are rechecked before a recovery write;
- credential-safe diagnostics remain intact;
- the public request schema remains unchanged;
- the successful outcome variants remain `approved / stale / validation_failed`;
- Tool annotation is `idempotentHint = true` after Phase 41 behavior is active.
