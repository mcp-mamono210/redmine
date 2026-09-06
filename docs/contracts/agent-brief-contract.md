# Agent Brief Contract

Status: v0.3.0 canonical contract  
Target release: v0.3.0  
Current format version: `1`

## Purpose

This document is the canonical contract for the versioned Agent Brief introduced
in Phase 35. An Agent Brief converts a human-oriented Redmine Issue into a
bounded implementation contract that a coding agent can execute without making
additional product or contract decisions.

This contract does not change the v0.2.0 MCP Tool surface. It defines an artifact
contract for later v0.3.0 phases.

## Responsibility boundary

An Agent Brief owns:

- traceability to one Redmine Issue;
- identification of one repository or other implementation target;
- the human-reviewed implementation goal, scope, requirements, constraints,
  acceptance criteria, verification, and deliverables;
- the Brief revision;
- the requirements fingerprint captured when the Brief was generated.

An Agent Brief does not own:

- Redmine workflow status or approval metadata;
- the persisted Git commit or other storage revision;
- queue position, claim, lease, heartbeat, retry, workspace, or execution state;
- Agent output, CI state, Pull Request state, or deployment state.

Redmine remains the source of truth for requirements, approval, priority, and
business state. Versioned Brief storage becomes the source of truth for Brief
content and revision history in Phase 37. Runtime state remains outside this
contract.

## Canonical representation

A format-version-1 Agent Brief is a UTF-8 Markdown document with:

1. a restricted YAML-compatible scalar frontmatter mapping;
2. the exact level-two title `## Agent Brief`;
3. the required level-three sections in the order defined below.

The frontmatter subset accepts one `key: value` scalar per line. Integer fields
use unquoted base-10 positive integers. String values may be unquoted or use
JSON-compatible double quoting. Nested mappings, arrays, multiline scalars,
aliases, tags, and duplicate keys are not part of format version 1.

Consumers must validate the complete document before using it. They must not
silently coerce an unsupported format, omit a failed section, or treat a partial
parse as an executable Brief.

## Frontmatter contract

| Field | Required | Contract |
| --- | --- | --- |
| `format_version` | Yes | Positive integer. Version 1 consumers accept only `1`. |
| `redmine_issue_id` | Yes | Positive integer identifying the source Redmine Issue. |
| `repository` | Conditional | Non-empty canonical repository identifier. Exactly one of `repository` and `implementation_target` is required. |
| `implementation_target` | Conditional | Non-empty target identifier for work not addressed to one repository. Exactly one target field is required. |
| `brief_revision` | Yes | Positive integer identifying the human-reviewable Brief content revision. |
| `requirements_fingerprint` | Yes | Lowercase `sha256:` followed by exactly 64 hexadecimal characters. |
| `brief_generated_at` | No | RFC 3339 timestamp retained for audit only. |
| `source_updated_on` | No | RFC 3339 Redmine timestamp retained for audit only; it is not a staleness decision. |
| `agent_hint` | No | Non-empty routing suggestion. It does not grant execution permission. |

Unknown metadata is invalid in format version 1. Runtime fields such as
`status`, `queue`, `claim`, `lease`, `heartbeat`, `retry`, `workspace`, or
`execution_state` are explicitly invalid.

`requirements_fingerprint` is an opaque value at this boundary. Phase 35
validates its representation but does not define or calculate the
canonicalization input. Phase 39 owns that algorithm and its staleness
comparison.

## Required sections

The following level-three sections are required, non-empty, unique, and ordered:

1. `Goal`
2. `Context`
3. `In Scope`
4. `Out of Scope`
5. `Requirements`
6. `Architecture / Contract Constraints`
7. `Acceptance Criteria`
8. `Verification`
9. `Deliverables`
10. `Unresolved / Blocking`

Their responsibilities are:

| Section | Required content |
| --- | --- |
| Goal | The observable outcome the implementation must establish. |
| Context | Confirmed facts needed to understand why the change exists. |
| In Scope | Responsibilities and behavior included in this execution. |
| Out of Scope | Explicit exclusions. Use `None.` when there is no meaningful exclusion. |
| Requirements | Required implementation behavior without fixing unnecessary private implementation details. |
| Architecture / Contract Constraints | Public API, schema, security, state, compatibility, ADR, and design boundaries that must remain stable. Use `None beyond repository conventions.` only when verified. |
| Acceptance Criteria | Concrete, independently decidable completion conditions. |
| Verification | Evidence or checks mapped to every acceptance criterion. |
| Deliverables | Files, code, tests, or reports the Agent must return. |
| Unresolved / Blocking | Decisions that prevent implementation. Use `None.` only when the Agent can start without additional requirements design. |

Lower-level headings may be used inside a section. Additional level-three
sections are not valid in format version 1 because consumers need a bounded,
unambiguous section set.

## Acceptance Criteria and Verification contract

Each acceptance criterion uses an unchecked Markdown checkbox and a unique
stable identifier:

```text
- [ ] AC-1: A concrete condition that can be judged true or false.
```

Checked boxes are invalid because completion state is runtime or workflow
state, not Brief content.

Every acceptance criterion must have at least one verification entry using the
same identifier:

```text
- AC-1: The existing test, command, inspection, or manual procedure that proves it.
```

A verification entry must not refer to an identifier absent from Acceptance
Criteria. The validator checks identifier coverage, not whether an asserted
test or command actually exists. Brief generation remains responsible for using
only verified repository commands and test names.

## Brief revision contract

The first stored Brief for an Issue and implementation target uses
`brief_revision: 1`.

The revision identifies the complete human-reviewable artifact. Change the
revision when any frontmatter value or required-section content changes. A
byte-identical artifact may retain its revision; two different artifacts must
not share the same Issue, target, and Brief revision identity.

The single-document validator can verify only that the revision is a positive
integer. Phase 37 persistence must enforce monotonic revision history and bind a
Brief revision to an immutable persisted revision.

Changing the Redmine requirements and regenerating the Brief changes both the
requirements fingerprint and the Brief revision. Changing only Redmine status,
assignee, or approval metadata does not by itself change either value.

## Format version and compatibility

`format_version` versions the document grammar and interpretation.
`brief_revision` versions content under that grammar. They are not
interchangeable.

Format version 1 is strict. A change requires a new format version when it:

- adds, removes, renames, or reorders required metadata or sections;
- changes a field type or semantic meaning;
- changes Acceptance Criteria or Verification syntax;
- changes whether a document is valid;
- changes the runtime-state exclusion boundary.

Editorial clarification that does not alter validity or interpretation does not
require a new format version. Consumers must reject unsupported versions with a
distinct validation failure. Support for a future version must be added
explicitly; it must not be inferred from numeric proximity.

## Validation contract

`validateAgentBrief(markdown)` returns one of:

```ts
{ success: true, data: AgentBrief }
```

or:

```ts
{
  success: false,
  issues: Array<{
    code: AgentBriefValidationIssueCode;
    path: string;
    message: string;
  }>;
}
```

Malformed user or generated content is a validation result, not an exception.
Each failure includes a stable category, a document path, and a diagnostic
message. In particular, unsupported format versions and forbidden runtime
fields have distinct categories.

Validation establishes structural conformance only. It does not:

- retrieve or compare the current Redmine Issue;
- calculate a requirements fingerprint;
- enforce persistence history;
- approve the Brief;
- transition Redmine state;
- authorize or start Agent execution.

Those responsibilities belong to Phases 36, 37, 39, and 40.

## Canonical example

[`examples/agent-brief-v1.md`](examples/agent-brief-v1.md) is a complete valid
format-version-1 example. Unit tests validate the tracked example through the
same implementation used by later phases.
