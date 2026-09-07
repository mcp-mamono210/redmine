# Architecture Decision Records

This directory contains architecture decisions for the Redmine MCP Server.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| ADR-001 | Use stdio as the MCP transport | Accepted |
| ADR-002 | Pin reproducible dependencies and runtime boundaries | Accepted |
| ADR-003 | Keep a small domain-oriented MCP tool surface | Accepted |
| ADR-004 | Treat MCP tool definitions as public contract | Accepted |
| ADR-005 | Treat context cost as a functional requirement | Accepted |
| ADR-006 | Use deterministic synthetic Redmine fixtures | Accepted |
| ADR-007 | Enforce a read-only least-privilege security boundary | Accepted |
| ADR-008 | Keep distribution independent from public registry publication | Accepted |
| ADR-009 | Use JSON text responses before structured output | Superseded by ADR-011 |
| ADR-010 | Provide deterministic local Redmine lifecycle commands | Accepted |
| ADR-011 | Publish outputSchema and structuredContent for Read-only Tools | Accepted |
| ADR-012 | Use a strict versioned Markdown Agent Brief contract | Accepted |
| ADR-013 | Use a bounded deterministic Redmine projection for Agent Brief generation | Accepted |
| ADR-014 | Classify CI changes by repository responsibility with a fail-safe full gate | Accepted |
| ADR-015 | Split CI verification by runtime need and isolate stateful jobs | Accepted |
| ADR-016 | Separate single-pass normal CI from an explicit reproducibility gate | Accepted |
| ADR-017 | Route normal CI by classification and require a fixed release full gate | Accepted |
| ADR-018 | Store versioned Agent Briefs in the target application repository | Accepted |
| ADR-019 | Separate Human Review, Handler Validation, and Agent handoff readiness | Accepted |
| ADR-020 | Map Agent Brief lifecycle to dedicated Redmine custom fields | Accepted |
| ADR-021 | Derive requirements fingerprints from the bounded generation-input semantics | Accepted |
| ADR-022 | Use one guarded MCP Tool for explicit Agent Brief approval | Accepted |

## Status values

```text
Proposed
Accepted
Superseded by ADR-NNN
Rejected
```

## Documentation precedence

```text
Public read-only MCP contract facts
  -> docs/contracts/read-only-mcp-contract.md

Agent Brief artifact contract facts
  -> docs/contracts/agent-brief-contract.md

Agent Brief generation input contract facts
  -> docs/contracts/agent-brief-generation-input-contract.md

Agent Brief requirements fingerprint contract facts
  -> docs/contracts/agent-brief-requirements-fingerprint-contract.md

Agent Brief persistence contract facts
  -> docs/contracts/agent-brief-persistence-contract.md

Agent Brief lifecycle / approval metadata contract facts
  -> docs/contracts/agent-brief-lifecycle-contract.md

Agent Brief Redmine lifecycle / approval metadata mapping facts
  -> docs/contracts/agent-brief-redmine-mapping-contract.md

Agent Brief Approval Handler / explicit MCP entry-point facts
  -> docs/contracts/agent-brief-approval-handler-contract.md

CI change-classification facts
  -> docs/contracts/ci-change-classification-contract.md

CI parallel-execution facts
  -> docs/contracts/ci-parallel-execution-contract.md

CI reproducibility/cadence facts
  -> docs/contracts/ci-reproducibility-execution-contract.md

CI normal/release routing facts
  -> docs/contracts/ci-release-gate-contract.md

Decision rationale
  -> relevant ADR

Implementation
  -> source and regression tests must implement the relevant contract
```
