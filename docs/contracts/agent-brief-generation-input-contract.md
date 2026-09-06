# Agent Brief Generation Input Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0  
Current format version: `1`

## Purpose

This document defines the canonical Phase 36 generation input contract used
before constructing a Phase 35 Agent Brief.

The contract projects a Redmine Issue into a bounded, deterministic, sanitized
input. It deliberately does not copy the complete Redmine Issue and does not
define an LLM prompt, Brief persistence, approval, or Agent execution.

This contract is internal to the Agent Brief generation boundary. It does not
add or change a public MCP Tool, public MCP input schema, or public MCP output
shape.

## Responsibility boundary

The generation input owns:

- traceability to one Redmine Issue;
- the current requirement-bearing Issue text selected by this contract;
- bounded supporting context from selected custom fields, journal notes,
  relations, and direct children;
- deterministic selection, ordering, truncation, and omission metadata;
- credential and secret sanitization before content can enter an LLM context.

The generation input does not own:

- the repository or other implementation target binding;
- the requirements fingerprint algorithm;
- the Brief revision or persistence identity;
- Redmine approval state;
- Redmine status transitions;
- Agent runtime, Queue, claim, lease, retry, or workspace state;
- an LLM prompt or model-specific token budget.

Redmine remains the requirements source of truth. Phase 35 remains the
canonical Agent Brief artifact contract.

## Source boundary

Phase 36 starts from the current `RedmineIssue` model.

The core Issue provides the following generation-relevant values when present:

- Issue ID;
- project ID and name;
- tracker ID and name;
- fixed version ID and name;
- subject;
- description;
- custom fields;
- updated timestamp.

Optional associations are not implicitly part of the generation input. They
are selected only through the rules below.

The following Redmine fields are excluded from format version 1 because they
represent workflow state, ownership, operational metadata, or information not
needed to derive implementation requirements:

- status;
- priority;
- author;
- assignee;
- start date;
- due date;
- done ratio;
- estimated hours;
- closed timestamp;
- privacy flag;
- allowed statuses;
- watcher data;
- attachment metadata and attachment URLs;
- journal field-change details.

Attachments are not fetched or dereferenced by this contract.

## Canonical representation

A format-version-1 generation input is a JSON-compatible object with this
logical shape:

```json
{
  "format_version": 1,
  "source": {
    "redmine_issue_id": 1234,
    "source_updated_on": "2026-09-06T00:00:00Z",
    "project": {
      "id": 10,
      "name": "Example Project"
    },
    "tracker": {
      "id": 2,
      "name": "Feature"
    },
    "fixed_version": {
      "id": 29,
      "name": "0.3.0"
    },
    "subject": "Define bounded Brief generation input",
    "description": "Current human-authored requirements."
  },
  "requirement_custom_fields": [],
  "journal_notes": [],
  "relations": [],
  "children": [],
  "projection": {
    "requirement_custom_field_ids": [],
    "redacted_paths": [],
    "truncated_paths": [],
    "omitted": {
      "requirement_custom_fields": 0,
      "journal_notes": 0,
      "relations": 0,
      "children": 0
    }
  }
}
```

Unknown top-level fields are not part of format version 1.

## Required source fields

The following values are required to construct a valid generation input:

| Field | Contract |
| --- | --- |
| `format_version` | Positive integer. Version 1 consumers accept only `1`. |
| `source.redmine_issue_id` | Positive Redmine Issue ID. |
| `source.source_updated_on` | RFC 3339 timestamp copied from the current Issue state. |
| `source.project` | Positive ID and non-empty project name. |
| `source.tracker` | Positive ID and non-empty tracker name. |
| `source.subject` | Non-empty sanitized text. |
| `source.description` | Sanitized text. It may be empty only when another selected requirement-bearing source is non-empty. |

`source.fixed_version` is optional. If present, it contains a positive ID and a
non-empty name.

A projection must fail rather than invent a missing Issue ID, project, tracker,
subject, or source timestamp.

## Requirement-bearing source rules

Format version 1 treats the following sources as potentially
requirement-bearing:

1. current Issue subject;
2. current Issue description;
3. explicitly allowlisted custom fields;
4. bounded journal note text;
5. relation metadata;
6. bounded direct-child summaries.

The projection does not semantically rewrite these values into Goal,
Requirements, Acceptance Criteria, or other Phase 35 sections. That
transformation occurs after a valid generation input exists.

### Custom fields

Custom fields are opt-in.

The caller supplies an explicit `requirement_custom_field_ids` allowlist as
trusted projection policy input. The canonical generation input records the
effective sorted unique allowlist in
`projection.requirement_custom_field_ids`.

Rules:

- the default allowlist is empty;
- at most 8 IDs are allowed;
- IDs must be positive integers;
- only non-empty values from allowlisted IDs are emitted;
- output is sorted by custom field ID ascending;
- an array-valued field is normalized by preserving Redmine value order after
  sanitization;
- a custom field whose name is credential-sensitive is excluded even when its
  ID is allowlisted.

Credential-sensitive names are matched case-insensitively against:

```text
password
credential
api key
api_key
token
secret
authorization
```

Automatically guessing requirement-bearing custom fields from their names is
not permitted in format version 1.

### Journal notes

Journals are supporting context, not a complete audit log.

Rules:

- only journals with non-empty `notes` are candidates;
- journal field-change `details` are excluded;
- journal user identity is excluded;
- select at most the 10 most recent candidate journals by
  `(created_on, id)` descending;
- emit the selected journals in `(created_on, id)` ascending order so the
  retained context reads chronologically;
- each emitted entry contains only `id`, `created_on`, and sanitized `notes`;
- older omitted candidates are counted in
  `projection.omitted.journal_notes`.

This rule bounds historical discussion while retaining the most recent human
clarifications.

### Relations

Relations provide linkage metadata only. Format version 1 does not recursively
fetch related Issue bodies.

Rules:

- emit at most 20 relations;
- compute `related_issue_id` as the other endpoint relative to the source
  Issue;
- emit only `id`, `relation_type`, `related_issue_id`, and `delay` when
  present;
- sort by `(relation_type, related_issue_id, id)` ascending;
- entries beyond the bound are omitted deterministically and counted in
  `projection.omitted.relations`.

A relation never authorizes recursive context expansion.

### Direct children

Direct children may identify work decomposition that constrains the parent
Issue.

Rules:

- emit at most 10 direct children;
- do not emit grandchildren or recursively expand descendants;
- emit `id`, `subject`, and optional tracker ID/name only;
- sort by child Issue ID ascending;
- entries beyond the bound are counted in
  `projection.omitted.children`.

## Text normalization

Before budget enforcement, every included text value is normalized
deterministically:

1. normalize CRLF and bare CR to LF;
2. remove a leading UTF-8 BOM when present;
3. trim leading and trailing whitespace;
4. preserve internal line breaks;
5. preserve source language and case;
6. sanitize credentials and secrets as defined below.

The projection must not summarize, paraphrase, translate, or infer missing
requirements during normalization.

## Credential and secret exclusion

Raw credentials must not appear in generation input.

Before any free text is emitted:

- every exact configured secret value supplied to the projection security
  boundary, including the configured Redmine API key, is replaced with
  `[REDACTED]`;
- `Authorization: ...` values are replaced with
  `Authorization: [REDACTED]`;
- `X-Redmine-API-Key: ...` values are replaced with
  `X-Redmine-API-Key: [REDACTED]`;
- values assigned to `password`, `credential`, `api key`, `api_key`, `token`,
  or `secret` labels using `:` or `=` are replaced with `[REDACTED]`;
- credential-sensitive custom fields are excluded entirely.

Each output path changed by sanitization is recorded once in
`projection.redacted_paths`. The raw secret value must not appear in that
metadata, diagnostics, warnings, or errors.

A generic hexadecimal string is not a secret solely because of its length;
commit SHAs and requirements fingerprints must not be redacted without a
credential signal or an exact configured-secret match.

## Context bounds

The canonical v1 projection applies all of the following limits:

| Item | Limit |
| --- | ---: |
| Requirement custom fields | 8 |
| Journal notes | 10 |
| Relations | 20 |
| Direct children | 10 |
| Subject | 512 UTF-8 bytes |
| Project / tracker / fixed-version name | 256 UTF-8 bytes each |
| Description | 8192 UTF-8 bytes |
| Custom-field name | 256 UTF-8 bytes |
| Custom-field scalar value | 1024 UTF-8 bytes |
| Journal note | 1024 UTF-8 bytes |
| Child subject | 512 UTF-8 bytes |
| Serialized generation input | 24576 UTF-8 bytes |

Text truncation must preserve valid UTF-8 and append `…` when truncation
occurs. Every truncated output path is recorded once in
`projection.truncated_paths`.

The final 24576-byte ceiling is a deterministic context-cost safety boundary,
not a model context-window claim. Under the existing project reference estimate
of `ceil(serialized UTF-8 bytes / 4)`, the ceiling corresponds to at most 6144
estimated tokens for the serialized generation input.

### Final-budget reduction order

Count limits and per-field limits are applied first. If canonical JSON
serialization still exceeds 24576 UTF-8 bytes, reduce context deterministically
in this order until the document fits:

1. omit the oldest retained journal note, one at a time;
2. omit direct children from the highest Issue ID downward;
3. omit relations from the end of canonical relation sort order;
4. truncate custom-field values from highest custom-field ID downward;
5. truncate `source.description`.

Core identity fields and `source.subject` are never removed by final-budget
reduction.

If the output cannot fit the final byte ceiling while preserving the required
identity fields and a non-empty requirement-bearing text source, projection
fails with a budget error rather than emitting an ambiguous partial input.

Omissions caused by final-budget reduction are included in the corresponding
`projection.omitted` count.

## Determinism and reproducibility

Given:

- the same current Redmine Issue state;
- the same optional association state;
- the same effective `requirement_custom_field_ids`;
- the same configured-secret set;

the projection must produce byte-equivalent canonical JSON after normalization.

Canonical JSON for reproducibility uses:

- UTF-8;
- LF line endings;
- two-space indentation;
- object property order defined by the example and this contract;
- arrays in the deterministic orders defined above;
- one trailing LF.

Generation timestamps are intentionally absent. A current-clock value would
break reproducibility.

`source.source_updated_on` records the Redmine source state but is not itself a
staleness decision. Phase 39 owns requirements fingerprinting and stale-Brief
detection.

## Omission metadata

Projection metadata makes bounded loss visible without copying excluded
content.

`projection.omitted` contains non-negative counts for:

- `requirement_custom_fields`;
- `journal_notes`;
- `relations`;
- `children`.

`projection.redacted_paths` and `projection.truncated_paths` contain sorted
unique JSON-style paths such as:

```text
source.description
requirement_custom_fields[0].value
journal_notes[2].notes
children[4].subject
```

The metadata never includes the omitted or redacted source values.

## Phase 35 connection

A valid Phase 36 generation input can supply the Redmine-derived inputs needed
to construct a Phase 35 Agent Brief:

| Phase 35 value | Phase 36 source |
| --- | --- |
| `redmine_issue_id` | `source.redmine_issue_id` |
| `source_updated_on` | `source.source_updated_on` |
| Goal / Context / Scope / Requirements / Acceptance Criteria / Constraints / Verification / Deliverables / Unresolved content | derived from the bounded requirement-bearing source text under human review |

Phase 36 does not invent or derive the Phase 35 `repository` or
`implementation_target`. Brief construction requires a separately verified
implementation-target binding.

Phase 36 also does not calculate `requirements_fingerprint`; Phase 39 owns its
canonicalization algorithm.

Phase 36 does not assign `brief_revision`; the Brief artifact and persistence
boundary own revision semantics.

## Invalid projection conditions

Projection must fail instead of returning a valid generation input when:

- the Issue ID, project, tracker, subject, or source timestamp required above is
  absent or invalid;
- both the normalized description and all other selected requirement-bearing
  text sources are empty;
- the custom-field allowlist is invalid or exceeds its bound;
- a relation cannot identify the other endpoint relative to the source Issue;
- sanitization cannot guarantee removal of an exact configured secret;
- the final serialized byte ceiling cannot be satisfied without removing the
  required identity or all requirement-bearing text.

Failure diagnostics must be bounded and sanitized. Raw Redmine responses and
raw credential values must not be copied into diagnostics.

## UI and automation boundary

The contract contains no ChatGPT-specific, browser-specific, or interactive-UI
state.

An interactive UI may request generation and supply trusted projection policy,
but the projection result is governed by this contract. A future Brief
Generator may reuse the same contract without changing its semantics.

Format version 1 does not implement or require:

- `Brief Requested`;
- webhook or polling automation;
- a resident Brief Generator service;
- Agent execution.

## Canonical example

[`examples/agent-brief-generation-input-v1.json`](examples/agent-brief-generation-input-v1.json)
is the canonical human-readable example for format version 1.
