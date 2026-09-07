# Agent Brief Approval Handler and Explicit Entry Point Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the Phase 40 Human Approval Handler contract and the
explicit human entry point used to request Handler Validation for one concrete,
human-reviewed Agent Brief.

Phase 40 consumes existing boundaries rather than redefining them:

- Phase 35 owns the Agent Brief artifact contract;
- Phase 36 owns bounded deterministic Redmine requirements projection;
- Phase 37 owns immutable versioned Brief persistence and persisted-revision
  identity;
- Phase 38 owns logical lifecycle, approval metadata, Redmine mapping, and the
  guarded lifecycle metadata write boundary;
- Phase 39 owns deterministic requirements fingerprint generation and
  staleness detection;
- Phase 40 owns one approval orchestration operation and one explicit public
  invocation boundary;
- Phase 41 owns duplicate-request idempotency and interrupted-write recovery.

The Phase 40 operation MUST NOT execute an Agent.

## Architectural decision

The v0.3.0 explicit human approval entry point is one narrow MCP write Tool:

```text
redmine_approve_agent_brief
```

A generic lifecycle mutation Tool, a generic custom-field write Tool, and a
public CLI are not part of the v0.3.0 Phase 40 public contract.

The Tool exists to continue one specific workflow: a human has reviewed one
immutable Agent Brief reference, the Issue is already in `Brief Ready`, and the
human explicitly requests Handler Validation for that exact reference.

The public Tool is an adapter. Approval business rules belong to the Phase 40
Approval Handler and MUST NOT be duplicated in the MCP registration layer.

## Source-of-truth boundary

The approval operation uses these authorities:

```text
Redmine latest Issue
  -> current Issue identity, project, requirements source,
     Agent Brief lifecycle, and approval metadata

Versioned Brief storage
  -> exact persisted Agent Brief bytes, Brief revision,
     repository identity, and persisted revision

Phase 39 staleness detection
  -> CURRENT / STALE / INVALID_REFERENCE /
     FINGERPRINT_UNAVAILABLE

Authenticated Redmine principal
  -> approver identity

Phase 40 attempt clock
  -> approved_at for a successful explicit approval attempt
```

The caller MUST NOT supply approval metadata values directly.

## Reviewed reference input

Human Review is bound to one concrete persisted artifact. The explicit request
therefore contains the reviewed immutable reference components that cannot be
silently replaced with a newer Brief:

```json
{
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>"
}
```

Public input rules:

| Field | Rule |
| --- | --- |
| `issue_id` | Required positive safe integer. |
| `brief_revision` | Required positive safe integer. |
| `persisted_revision` | Required non-empty string. It is opaque to the MCP contract. |

The repository is not a caller-controlled input. It comes from the configured
Phase 37 persistence boundary and MUST agree with the stored Brief metadata.

The caller does not supply:

- requirements fingerprint;
- approver identity;
- approval timestamp;
- lifecycle target;
- Redmine custom-field IDs.

Those values are established by trusted application boundaries.

## Approval target selection

The Handler MUST operate on the exact reviewed reference from the request.

It MUST NOT replace that reference with the mutable notion of the latest or
current Brief merely because a newer persisted revision exists.

The Handler MUST verify all of the following before approval can continue:

1. the latest Redmine Issue exists and matches `issue_id`;
2. the latest Issue lifecycle is exactly `Brief Ready`;
3. the requested `brief_revision` exists in the configured Phase 37 storage;
4. the stored Brief metadata has the same Redmine Issue identity;
5. the stored Brief metadata has the same repository identity as the configured
   persistence boundary;
6. the stored Brief metadata has the same `brief_revision` as the request;
7. the persisted revision returned by Phase 37 is exactly the caller-reviewed
   `persisted_revision`;
8. the stored Agent Brief satisfies the canonical Agent Brief artifact contract.

A mismatch is a validation failure. The Handler MUST NOT approve a different
artifact as a fallback.

## Approval Handler orchestration

The normal Phase 40 operation is:

```text
explicit human MCP call
        |
        v
validate public request
        |
        v
capture one approval-attempt timestamp
        |
        v
fetch latest Redmine Issue
        |
        v
require lifecycle == Brief Ready
        |
        v
read exact requested persisted Brief revision
        |
        v
verify Issue / repository / revision / persisted revision
        |
        v
project latest Redmine requirements through Phase 36
        |
        v
run Phase 39 staleness detection
        |
        +-----------------------------+
        |                             |
        | CURRENT                     | STALE
        v                             v
resolve authenticated            Phase 38 transition
Redmine principal                Brief Ready -> Brief Draft
        |                             |
        v                             v
build approval metadata          read-back verification
        |                             |
        v                             v
Phase 38 transition              return outcome = stale
Brief Ready -> Ready for Agent
        |
        v
read-back verification
        |
        v
return outcome = approved
```

`INVALID_REFERENCE` and `FINGERPRINT_UNAVAILABLE` do not perform a lifecycle
transition and do not write approval metadata.

## Requirements staleness result mapping

Phase 40 preserves the semantic distinction established by Phase 39:

| Phase 39 result | Phase 40 action |
| --- | --- |
| `CURRENT` | Continue approval validation and attempt `Ready for Agent`. |
| `STALE` | Transition `Brief Ready -> Brief Draft`; do not write new approval metadata. |
| `INVALID_REFERENCE` | Return `validation_failed` with `reviewed_reference_invalid`; do not mutate lifecycle. |
| `FINGERPRINT_UNAVAILABLE` | Return `validation_failed` with `fingerprint_unavailable`; do not mutate lifecycle. |

A staleness-detection failure MUST NOT be converted into `STALE` merely to take
a conservative reset path. `STALE` has a specific meaning: both canonical
fingerprints were available and did not match.

## Approval metadata construction

Only the Handler constructs approval metadata for a `CURRENT` result.

The values are:

```text
approver_identity
  -> redmine-user:<positive-user-id> derived from the authenticated
     Redmine principal used by this server

approved_at
  -> the single Phase 40 approval-attempt timestamp captured for the
     explicit human invocation

approved_brief_revision
  -> the verified request brief_revision

approved_persisted_revision
  -> the verified Phase 37 persisted revision

approved_requirements_fingerprint
  -> the verified CURRENT requirements fingerprint
```

The explicit MCP request does not accept an arbitrary `approver_identity` or
`approved_at`. This prevents the public Tool from becoming an identity- or
timestamp-spoofing surface.

A deployment that requires person-level approval attribution MUST run the write
operation under a Redmine principal whose identity is acceptable as the
approver of record. Phase 40 does not invent a second unauthenticated identity
namespace.

`approved_at` represents the explicit human approval action associated with
this invocation. It is not reconstructed from Redmine `updated_on` and is not
the time of a later retry or recovery action.

## Lifecycle rules

The explicit approval Tool may start Handler Validation only when the latest
lifecycle is:

```text
Brief Ready
```

The Tool MUST NOT perform a direct:

```text
Brief Draft -> Ready for Agent
```

Successful CURRENT processing uses the existing Phase 38 guarded transition:

```text
Brief Ready -> Ready for Agent
```

STALE processing uses the existing Phase 38 guarded reset:

```text
Brief Ready -> Brief Draft
```

The Phase 40 Handler MUST NOT introduce a second Redmine custom-field writer or
bypass the Phase 38 lifecycle metadata boundary.

## Public MCP Tool contract

### Tool name

```text
redmine_approve_agent_brief
```

### Description

The published Tool description MUST communicate all of these facts without
requiring hidden knowledge:

- it is an explicit write action for one human-reviewed Agent Brief reference;
- the Issue must already be in `Brief Ready`;
- it validates the reviewed immutable reference against current Redmine
  requirements;
- a CURRENT result may record approval metadata and move to
  `Ready for Agent`;
- a STALE result moves the lifecycle back to `Brief Draft`;
- it does not execute an Agent.

### Access classification and publication

The Tool Registry entry has:

```text
access = write
```

It is published only when the existing write-publication guard allows write
Tools. With `REDMINE_WRITE_ENABLED=false`, the Tool is absent from `tools/list`.

Project authorization remains a runtime decision because the Issue determines
the target project. The existing `REDMINE_ALLOWED_PROJECTS` / Write Guard
boundary MUST be enforced before any lifecycle or approval metadata write.

The Tool is not idempotent by Phase 40 contract. Phase 41 owns repeat-call and
interrupted-update recovery semantics.

Recommended MCP annotations for the v0.3.0 contract are:

```text
readOnlyHint = false
destructiveHint = false
idempotentHint = false
openWorldHint = true
```

### Successful public response variants

A successfully executed Tool call returns one of three bounded domain outcomes.
Public JSON field names use `snake_case`.

#### `approved`

Returned only after the Phase 38 read-back proves `Ready for Agent`, complete
approval metadata, and handoff eligibility for the exact reviewed reference.

```json
{
  "outcome": "approved",
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>",
  "requirements_fingerprint": "sha256:<64 lowercase hexadecimal characters>",
  "lifecycle": "Ready for Agent",
  "approver_identity": "redmine-user:7",
  "approved_at": "2026-09-07T08:00:00Z",
  "handoff_eligible": true
}
```

#### `stale`

Returned only after Phase 39 reported `STALE` and Phase 38 read-back proves the
lifecycle was reset to `Brief Draft`.

```json
{
  "outcome": "stale",
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>",
  "persisted_requirements_fingerprint": "sha256:<64 lowercase hexadecimal characters>",
  "current_requirements_fingerprint": "sha256:<64 lowercase hexadecimal characters>",
  "lifecycle": "Brief Draft",
  "handoff_eligible": false
}
```

#### `validation_failed`

Returned for a machine-checkable approval precondition failure that occurs
before a Phase 40 lifecycle write.

```json
{
  "outcome": "validation_failed",
  "issue_id": 42,
  "brief_revision": 3,
  "persisted_revision": "<opaque persisted revision>",
  "reason": "reviewed_reference_invalid",
  "handoff_eligible": false
}
```

The v0.3.0 `reason` values are exactly:

```text
lifecycle_not_brief_ready
reviewed_reference_invalid
fingerprint_unavailable
```

`validation_failed` MUST NOT be used after an attempted Redmine write whose
result cannot be established. Unknown or failed write completion is an
application error, not a clean validation result.

### Structured output

Like the existing bounded MCP surface, a successful Phase 40 Tool call exposes
the same public response object in both representations:

```text
content[0].text
  -> JSON serialization of the public outcome object

structuredContent
  -> the same public outcome object
```

The Tool declares an `outputSchema` covering the three successful domain
variants. The text JSON and `structuredContent` MUST be equivalent.

## Application errors

Malformed MCP input is a normal public input/schema failure.

Failures outside the bounded domain outcomes use the server's application error
path. This includes at least:

- Redmine authentication or permission failure;
- Write Guard or allowed-project rejection;
- Redmine backend unavailability;
- persistence storage read failure that is not a clean missing/mismatched
  reviewed reference;
- lifecycle write failure;
- lifecycle read-back mismatch;
- authenticated approver-principal lookup failure;
- unexpected internal failure.

The public error path MUST remain bounded and sanitized. It MUST NOT return API
keys, Authorization values, raw backend bodies, stack traces, secret values, or
exception causes.

The Phase 40 contract does not promise transactional rollback after an unknown
backend write result. It promises that such a condition is never reported as
`approved` or `stale` success. Phase 41 owns recovery and idempotency.

## Partial failure and success criteria

An approval attempt is successful only when the final Phase 38 read-back proves
all of these values agree:

```text
lifecycle == Ready for Agent
approval metadata complete
approved_brief_revision == reviewed brief_revision
approved_persisted_revision == reviewed persisted_revision
approved_requirements_fingerprint == CURRENT fingerprint
handoff_eligible == true
```

A stale attempt is successfully handled only when the final read-back proves:

```text
lifecycle == Brief Draft
handoff_eligible == false
```

Approval metadata alone is not success. Lifecycle alone is not success.
A transport response that leaves final state unknown is not success.

Phase 40 does not implement rollback, replay, or duplicate-request convergence.
Those are Phase 41 responsibilities.

## Credential-safe diagnostics

Diagnostics may identify stable domain categories, Issue IDs, Brief revisions,
and opaque persisted revisions when needed to identify the reviewed artifact.

Diagnostics MUST NOT copy:

- Redmine API keys;
- Authorization headers;
- passwords;
- configured secret values;
- raw Redmine error bodies;
- unbounded exception messages;
- stack traces or nested causes.

Requirements text is not required in approval error messages and SHOULD NOT be
copied merely to explain a fingerprint mismatch.

## No duplicated business logic in the entry point

The MCP adapter owns only:

```text
public schema validation
public/internal naming conversion
Approval Handler invocation
bounded public outcome serialization
bounded public error mapping
```

It does not own:

```text
persisted Brief selection rules
Phase 37 identity validation
Phase 39 fingerprint generation
Phase 39 staleness comparison
approval metadata construction rules
lifecycle transition rules
Redmine custom-field writes
```

Those responsibilities remain in the existing domain boundaries and the Phase
40 Approval Handler.

## Phase 41 boundary

Phase 40 intentionally does not define a successful duplicate-call response,
retry token, approval request identifier, replay protocol, rollback protocol,
or crash-recovery journal.

A repeated call after a completed transition may observe a lifecycle other than
`Brief Ready`; Phase 40 alone does not reinterpret that as idempotent success.

Phase 41 may add idempotency/recovery behavior through an explicit contract
change without moving those concerns backward into the Phase 40 Handler
contract.

## Regression obligations

Phase 40-2 and Phase 40-3 implementation must add executable coverage proving at
least:

- only `Brief Ready` can begin approval;
- the exact reviewed Brief revision and persisted revision are validated;
- CURRENT is the only Phase 39 result that can proceed to approval metadata;
- STALE resets to `Brief Draft` and never returns approval success;
- INVALID_REFERENCE and FINGERPRINT_UNAVAILABLE remain distinct from STALE;
- Write Guard and project allowlist are not bypassed;
- no alternate custom-field write path is introduced;
- public MCP input/output names match this contract;
- the entry point delegates business logic to the Handler;
- successful text JSON and `structuredContent` are equivalent;
- diagnostics do not disclose credentials;
- Phase 40 does not execute an Agent.
