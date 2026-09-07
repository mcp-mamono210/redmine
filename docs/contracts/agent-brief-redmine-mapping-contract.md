# Agent Brief Redmine Lifecycle Mapping Contract

Status: Draft for unreleased v0.3.0  
Target release: v0.3.0  
Contract version: `1`

## Purpose

This document defines the Phase 38-2 physical Redmine mapping for the logical
Agent Brief lifecycle and approval metadata defined by
`docs/contracts/agent-brief-lifecycle-contract.md`.

The mapping keeps ordinary Redmine Issue Status workflow separate from Agent
Brief approval state, uses dedicated Issue custom fields for lifecycle and
approval metadata, resolves environment-specific custom-field IDs from the
current Issue payload, and fails closed when the required mapping is missing or
ambiguous.

Phase 38-2 defines the mapping and required Redmine configuration alignment.
Phase 38-3 implements the application boundary that consumes this contract.

## Verified current-environment facts

The Phase 38-2 inspection on 2026-09-07 established the following facts for the
current Redmine environment.

### Issue Status values

The available Issue Status records are:

| ID | Name | Closed |
| ---: | --- | --- |
| 1 | `新規` | no |
| 2 | `進行中` | no |
| 3 | `解決` | no |
| 4 | `フィードバック` | no |
| 5 | `終了` | yes |
| 6 | `却下` | yes |

There are no verified Issue Status records named `Brief Draft`, `Brief Ready`,
or `Ready for Agent`.

The numeric IDs above are an environment snapshot only. Application code must
not use them as Agent Brief lifecycle constants.

### Issue custom-field visibility

Issue `#5365` in the current target project exposes one applicable custom field:

```text
id: 10
name: release_tag
```

No Agent Brief lifecycle or approval-metadata custom fields are currently
visible on that Issue.

The administrative custom-field inventory endpoint returns HTTP `403` for the
current integration credential. Therefore Phase 38 must not require global
custom-field enumeration at runtime and must not guess custom-field IDs from an
unavailable administrative view.

The `release_tag` field is unrelated to Agent Brief approval and must not be
reused for lifecycle or approval metadata.

## Representation decision

Agent Brief lifecycle is represented by a dedicated Issue custom field rather
than by Redmine Issue Status.

This preserves two independent concerns:

```text
Redmine Issue Status
  -> ordinary ticket/workflow state

Agent Brief Lifecycle custom field
  -> Brief Draft / Brief Ready / Ready for Agent
```

Phase 38 must not rename, replace, or overload the existing Issue Status values
to encode Agent Brief approval state.

Approval metadata is represented by dedicated Issue custom fields on the same
Issue.

## Required Redmine configuration alignment

Before Phase 38-3 can treat the mapping as available, the following Issue custom
fields must exist and be applicable to the current Agent Brief project/tracker
scope.

The current target scope is project `Redmine` (observed ID `414`) and tracker
`機能` (observed ID `2`). Those IDs are environment facts, not portable runtime
constants. Deployment/configuration must select the intended project/tracker
scope explicitly.

| Logical field | Exact Redmine custom-field name | Expected format | Redmine-level required | Allowed / required value |
| --- | --- | --- | --- | --- |
| lifecycle state | `Agent Brief Lifecycle` | single-value list | no | exactly `Brief Draft`, `Brief Ready`, or `Ready for Agent` |
| `approver_identity` | `Brief Approved By` | string | no | `redmine-user:<positive-user-id>` |
| `approved_at` | `Brief Approved At` | string | no | RFC 3339 timestamp with timezone/offset |
| `approved_brief_revision` | `Approved Brief Revision` | integer | no | positive base-10 integer |
| `approved_persisted_revision` | `Approved Persisted Revision` | string | no | non-empty opaque persisted-revision identifier |
| `approved_requirements_fingerprint` | `Approved Req Fingerprint` | string | no | lowercase `sha256:` plus 64 lowercase hexadecimal characters |

These fields are intentionally not globally required by Redmine because
`Brief Draft` and `Brief Ready` do not require a completed approval record.
Conditional completeness is enforced by the Phase 38 application boundary.

The field names above are the canonical v0.3.0 mapping keys. Their numeric
custom-field IDs are environment-specific and are not part of this contract.

## Lifecycle mapping

The mapping is one-to-one:

| Logical lifecycle state | `Agent Brief Lifecycle` value | Handoff eligible |
| --- | --- | --- |
| `Brief Draft` | `Brief Draft` | no |
| `Brief Ready` | `Brief Ready` | no |
| `Ready for Agent` | `Ready for Agent` | yes, only with a complete and consistent approval record |

Any other value is `unknown_lifecycle_state` and must fail closed.

An absent lifecycle field or empty lifecycle value is not implicitly
`Brief Draft`; it is a missing mapping/configuration condition and must fail
closed.

## Approval metadata mapping

### Approver identity

`Brief Approved By` stores a stable Redmine principal reference:

```text
redmine-user:<positive-user-id>
```

The display name is not the identity and must not be used as the persisted
approval key.

### Approval time

`Brief Approved At` stores the human approval decision time as RFC 3339 text.
A timestamp must include a timezone or UTC offset.

The field stores the Human Review approval time, not an inferred Issue update
time and not the Handler completion time.

### Approved Brief revision

`Approved Brief Revision` stores the positive Phase 35 `brief_revision`.
Leading signs, zero, negative values, fractions, and non-numeric text are
invalid.

### Approved persisted revision

`Approved Persisted Revision` stores the opaque immutable Phase 37
`persisted_revision` for the exact approved Brief bytes.

The mapping does not assume SHA-1, SHA-256, a fixed Git object-ID length, or a
commit SHA. The value is interpreted according to the Phase 37 persistence
contract.

### Approved requirements fingerprint

`Approved Req Fingerprint` stores the approved Brief's requirements fingerprint
using the Phase 35 representation:

```text
sha256:<64 lowercase hexadecimal characters>
```

Phase 38 stores and validates the representation only. Phase 39 owns
canonicalization, calculation, comparison, and stale-result semantics.

## Conditional metadata consistency

`Ready for Agent` is valid only when all five approval metadata fields are
present, syntactically valid, and consistent with the exact Phase 37 persisted
Brief reference accepted by Handler Validation.

The following combinations must fail closed for handoff:

- `Ready for Agent` with any required approval field absent or empty;
- `Ready for Agent` with an invalid approver identity;
- `Ready for Agent` with an invalid approval timestamp;
- `Ready for Agent` with a non-positive Brief revision;
- `Ready for Agent` with an invalid requirements fingerprint;
- approval metadata that resolves to a different Brief revision or persisted
  revision than the validated Phase 37 artifact.

`Brief Draft` and `Brief Ready` never grant handoff eligibility, even when old
approval-looking values remain present. Later stale/reset/recovery operations
may clear such values, but their presence must never be interpreted as approval
without `Ready for Agent` and a complete consistency check.

## Custom-field ID resolution

Phase 38-3 must not hard-code numeric custom-field IDs.

For each target Issue it must resolve the six required mappings from the
Issue's own `custom_fields` collection by exact canonical field name.

Conceptually:

```text
GET/read Issue
    -> issue.custom_fields
    -> exact-name lookup
    -> environment-specific field IDs
    -> parse/validate logical values
```

Each required canonical name must resolve exactly once.

The boundary must fail closed when:

- a required field is missing from the Issue payload;
- the mapping is ambiguous;
- the lifecycle value is unknown;
- a required value cannot be parsed according to this contract.

The runtime boundary must not depend on the administrative custom-field listing
endpoint. This keeps production operation compatible with least-privilege
credentials that can read/write the target Issue but cannot enumerate global
Redmine administration metadata.

Resolved IDs may be cached internally only if the implementation can guarantee
that the cache is scoped to the same Redmine environment and does not convert a
missing/changed mapping into silent success.

## Project and tracker scope

The required fields must be configured so they are visible on every Issue for
which the Phase 38 lifecycle boundary is enabled.

For the current Phase 38 target this includes the project/tracker scope observed
for `#5365`:

```text
project: Redmine
tracker: 機能
```

Phase 38-3 must still enforce the existing allowed-project boundary before any
write. A custom field being visible on an Issue does not itself grant write
permission.

A future project may adopt the same logical contract only after the required
custom fields are configured for that project/tracker scope and the project is
explicitly allowed by the existing Write Guard configuration.

## Writer permission and Write Guard alignment

The existing application security boundary remains authoritative.

The current repository loads write permission from:

```text
REDMINE_WRITE_ENABLED
REDMINE_ALLOWED_PROJECTS
```

An unset/false write switch or an empty/non-matching project allowlist must
continue to deny lifecycle/approval writes.

Phase 38-3 must reuse the existing production Write Guard and allowed-project
composition. It must not create a second lifecycle-specific bypass, generic
custom-field writer, or alternate Redmine credential path.

Read-only discovery of lifecycle metadata does not grant write permission.

## Update boundary

A Phase 38 lifecycle/approval update may change only the canonical Phase 38
custom fields required for the requested logical operation, plus the ordinary
Issue state only when a later explicitly defined contract requires it.

Phase 38-3 must not expose arbitrary custom-field mutation as a side effect of
this mapping.

The mapping does not authorize writes to:

```text
release_tag
queue
claim
lease
heartbeat
retry
running
completed
workspace
execution_state
agent_output
ci_state
pull_request_state
deployment_state
```

Runtime state remains outside the Phase 38 lifecycle contract.

## Configuration-alignment completion condition

The current Redmine environment is aligned for Phase 38-3 only when an Issue in
the configured target project/tracker exposes all six canonical custom-field
names in its `custom_fields` collection and `Agent Brief Lifecycle` provides
exactly the three canonical lifecycle values.

Until that condition is met, Phase 38-3 must report the mapping as unavailable
rather than substituting an existing Issue Status or unrelated custom field.

The administrative action used to create/configure the custom fields is an
environment operation, not a public MCP contract. No admin Tool name or REST
write endpoint is defined by this document.

## Fail-closed semantic conditions

Phase 38-3 callers must be able to distinguish at least these semantic
conditions, using private error types if appropriate:

```text
lifecycle_mapping_missing
lifecycle_mapping_ambiguous
unknown_lifecycle_state
approval_metadata_incomplete
approval_metadata_invalid
approval_reference_mismatch
project_not_allowed
writes_disabled
```

Diagnostics must not include credentials or API keys.

## Phase handoff

Phase 38-3 implements this mapping through an internal lifecycle/approval
metadata boundary and verifies both read and write behavior.

Phase 39 owns requirements-fingerprint canonicalization and staleness.

Phase 40 owns the explicit Human Approval / Handler Validation orchestration
that may write a complete approval record and transition the lifecycle to
`Ready for Agent`.

Phase 41 owns idempotency and interrupted-update recovery.
