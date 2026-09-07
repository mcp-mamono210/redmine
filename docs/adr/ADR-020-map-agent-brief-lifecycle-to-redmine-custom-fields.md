# ADR-020: Map Agent Brief lifecycle to dedicated Redmine custom fields

Status: Accepted  
Date: 2026-09-07

## Context

ADR-019 established three logical Agent Brief lifecycle states:

```text
Brief Draft
Brief Ready
Ready for Agent
```

Phase 38-2 must map those logical values and the required approval metadata to
the current Redmine configuration without guessing environment-specific IDs.

The current Redmine environment exposes the ordinary Issue Status workflow:

```text
新規
進行中
解決
フィードバック
終了
却下
```

No verified Issue Status has one of the Agent Brief lifecycle names.

The current Phase 38 target Issue exposes only the unrelated `release_tag`
custom field. The global custom-field listing endpoint returns `403` for the
current integration credential, so a runtime design that requires administrative
custom-field enumeration would violate the intended least-privilege boundary.

Three representation strategies were considered:

1. add dedicated Redmine Issue Status values for Agent Brief lifecycle;
2. reuse the existing Issue Status workflow and infer Brief lifecycle from it;
3. preserve Issue Status for ordinary ticket workflow and use dedicated Issue
   custom fields for Agent Brief lifecycle and approval metadata.

The lifecycle is orthogonal to normal ticket progress. A ticket may remain
open/active while its Brief moves between review states, and `Ready for Agent`
means handoff eligibility rather than ticket completion.

## Decision

For v0.3.0, preserve the existing Redmine Issue Status workflow and represent
Agent Brief lifecycle with a dedicated single-value Issue custom field named:

```text
Agent Brief Lifecycle
```

Its only valid values are:

```text
Brief Draft
Brief Ready
Ready for Agent
```

Represent the five required approval metadata values with these dedicated Issue
custom fields:

```text
Brief Approved By
Brief Approved At
Approved Brief Revision
Approved Persisted Revision
Approved Req Fingerprint
```

Do not reuse `release_tag` or another unrelated field.

Do not hard-code numeric custom-field IDs. Phase 38-3 resolves the mapping from
the target Issue's `custom_fields` collection by exact canonical field name and
fails closed when a required field is absent or ambiguous.

The runtime boundary does not depend on the Redmine administrative custom-field
inventory endpoint. Configuration administration may still use normal Redmine
administration mechanisms outside the application runtime.

All six custom fields are optional at the Redmine schema level because a Draft
or validation-pending Brief does not have a complete final approval record.
The application contract conditionally requires all approval metadata when the
lifecycle is `Ready for Agent`.

Use a stable principal string `redmine-user:<id>` for approver identity, RFC
3339 text for the approval timestamp, a positive integer for Brief revision, an
opaque string for persisted revision, and the Phase 35 `sha256:` representation
for requirements fingerprint.

Phase 38 writes continue to use the existing Writer permission, Write Guard, and
allowed-project boundary. Visibility of the custom fields does not grant write
permission.

## Consequences

Normal Redmine ticket status remains independent from Brief review state. The
project can continue using its existing `新規 / 進行中 / 解決 / ...` workflow
without inventing status transitions solely for Agent Brief approval.

The logical lifecycle maps in both directions without relying on localized Issue
Status names or environment-specific status IDs.

Custom-field IDs may differ across development, CI, and production Redmine
instances without requiring source changes because the application resolves
IDs from each Issue payload.

The runtime credential does not need global Redmine administration visibility.
This preserves least privilege and remains compatible with the observed `403`
from custom-field inventory enumeration.

The current environment requires configuration alignment before Phase 38-3 can
succeed: the six canonical custom fields must be created/configured and made
applicable to the target project/tracker scope.

A missing field is a configuration error, not a reason to infer lifecycle from
Issue Status or to reuse an unrelated custom field.

A future decision to encode Agent Brief lifecycle directly in Issue Status,
rename canonical fields, change lifecycle values, or make a public generic
custom-field writer requires an explicit contract/ADR change.

The exact field formats, validation rules, mapping resolution, and security
requirements are defined in
`docs/contracts/agent-brief-redmine-mapping-contract.md`.
