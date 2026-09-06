# ADR-013: Use a bounded deterministic Redmine projection for Agent Brief generation

Status: Accepted  
Date: 2026-09-06

## Context

Phase 35 established a strict versioned Agent Brief contract, but a Redmine
Issue contains more information than a Brief generator should place into an LLM
context.

The current Redmine client exposes core Issue fields and can optionally expose
journals, relations, children, attachments, and allowed statuses. Passing the
complete Issue and every optional association into generation would couple
Brief quality to historical volume, increase Context Cost, and make accidental
credential disclosure harder to control.

The initial v0.3.0 workflow is interactive, but the projection boundary must be
reusable by a future generator without embedding ChatGPT- or UI-specific state.

## Decision

For v0.3.0, define a versioned JSON-compatible Agent Brief generation input
contract with these properties:

- start from the current Redmine Issue core rather than a discovery summary;
- include only requirement-bearing core fields;
- make custom fields opt-in through an explicit ID allowlist;
- retain only bounded recent non-empty journal notes and exclude journal
  field-change details;
- include relation metadata without recursively fetching related Issue bodies;
- include only bounded direct-child summaries and no descendant recursion;
- exclude attachments, allowed statuses, workflow ownership, and runtime state;
- normalize and sanitize text deterministically before it can enter generation
  context;
- record redaction, truncation, and omission metadata without copying removed
  values;
- enforce a deterministic serialized-byte ceiling aligned with the project's
  existing byte-based Context Budget reference estimate;
- keep repository / implementation-target binding outside the Redmine
  projection because the current Redmine Issue model does not establish that
  binding;
- keep requirements fingerprinting in Phase 39;
- do not add or change any public MCP Tool for Phase 36-1.

The exact format, field rules, bounds, and Phase 35 mapping are defined by
`docs/contracts/agent-brief-generation-input-contract.md`.

## Consequences

The same source state and projection policy can produce the same canonical
generation input regardless of which interactive or future automated entry
point invokes the projection.

Historical Issue growth is prevented from expanding generation context without
bound. Omitted and truncated content remains visible as metadata so downstream
generation does not silently assume that complete history was supplied.

Requirement-bearing custom fields require explicit configuration. This is more
conservative than automatically including all custom fields, but avoids turning
arbitrary project metadata or credential fields into LLM context.

Relation bodies are not recursively expanded in format version 1. If later
requirements show that related Issue content is necessary, that enrichment must
define its own bounded rule and compatibility impact.

The generation input is not yet executable Agent work. Human review, Phase 35
Brief validation, persistence, fingerprint staleness checks, approval, and
Agent execution remain separate responsibilities.
