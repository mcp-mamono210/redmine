# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes have been recorded after the v0.2.0 release candidate.

## [0.2.0] - Release candidate

### Added

- Added `outputSchema` declarations and equivalent `structuredContent` results for all six published Read-only Tools while retaining JSON text responses.
- Added bounded `redmine_get_project` aggregation for versions, memberships, and issue priorities, including partial-result warnings and membership truncation reporting.
- Added read/write Tool Registry classification, duplicate-name validation, write-publication filtering, and project allowlist guards without publishing write tools in v0.2.0.
- Added deterministic writer-role fixtures and permission-boundary coverage for read-only and writer credentials.
- Added a shared MCP E2E Harness and migrated the Read-only Tool workflows to it.
- Added committed Context Budget baselines for Tool discovery, representative Tool responses, heavy/include responses, and multi-call workflows.
- Added Context Budget regression classification, a human-readable comparison report, explicit baseline-update commands, and a CircleCI release gate.
- Added MCP Tool annotations for the published Read-only Tool surface.

### Changed

- Changed `redmine_get_project` so successful optional metadata requests return arrays while independently failed sections return `null` with bounded, sanitized warnings.
- Centralized MCP Tool registration and publication decisions in the Tool Registry.
- Serialized Redmine-dependent integration and E2E suites and added explicit Redmine reset boundaries so deterministic fixtures are not shared across suites.
- Added repeated Context Budget, integration, and MCP E2E execution to CircleCI to detect order-dependent or one-time-success behavior.
- Normalized null or missing Redmine custom-field values to an empty string at the client schema boundary.

### Security

- Kept write Tool publication disabled by default and separate from the read-only Redmine credential boundary.
- Prevented Context Budget diagnostics and baselines from including raw MCP responses or configured secrets.
- Preserved bounded, sanitized application errors independently from the successful structured-output contract.

## [0.1.1] - 2026-08-24

### Added

- Added deterministic serialized-byte context measurement for the read-only MCP surface.
- Added regression coverage for the exact read-only tool surface, input schemas, pagination bounds, response naming, and summary projections.
- Added Issue workflow regression coverage for search/list discovery, core-only detail retrieval, optional includes, and unsupported include rejection.
- Added Project Stable Envelope regression coverage, including `null` versus empty-array semantics.
- Added bounded HTTP 422 `validation_error` details with regression coverage for error count, message length, whitespace normalization, and credential sanitization.
- Added ADR indexing, documentation source-of-truth guidance, and `AGENTS.md` reading-order guidance.
- Added a pinned Node.js runtime shared by local development and CircleCI.

### Changed

- Changed issue list and search defaults to bounded summary responses with a default limit of 10 and maximum limit of 20.
- Limited `redmine_list_projects` to a maximum limit of 100.
- Changed successful public MCP JSON serialization to `snake_case` while retaining internal TypeScript `camelCase`.
- Changed `redmine_get_issue` to return a core-only response by default and expose associated data only through explicit public `include` values.
- Changed `redmine_get_project` to return the Stable Envelope with explicit `null` placeholders for metadata not yet fetched.
- Aligned README, ADR, and contract documentation responsibilities so exact public MCP behavior has a single canonical document.
- Clarified optional include semantics for Redmine versions that omit empty included sections.

### Security

- Added regression coverage ensuring configured API keys, Authorization values, passwords, credentials, backend exception details, and stack traces are not exposed through MCP errors.
- Added a production `no-console` lint guard so stdout remains reserved for MCP stdio protocol traffic.
- Preserved least-privilege read-only behavior, including empty `allowed_statuses` for the deterministic read-only role.

## [0.1.0] - 2026-08-22

### Added

- Added a unified MCP application error model for RedmineClient failures.
- Added stable MCP error codes for authentication, permissions, missing resources, invalid requests, backend availability, invalid backend responses, and unexpected internal failures.
- Added a shared MCP tool error result builder.
- Added unit coverage for RedmineClient-to-MCP error mapping and API-key sanitization.
- Added MCP stdio E2E coverage for invalid Redmine credentials.
- Added a shared registration entry point for read-only MCP tools.
- Added unit coverage for the extracted Current User tool handler and shared error handling.
- Added `redmine_get_issue` for retrieving detailed Redmine issue data.
- Added `redmine_list_issues` with structured filtering and pagination.
- Added Issue MCP tool input validation, unit coverage, and stdio end-to-end coverage.
- Added `redmine_get_project` for retrieving detailed Redmine project metadata.
- Added `redmine_list_projects` with pagination.
- Added Project MCP tool input validation, unit coverage, and stdio end-to-end coverage.
- Added `redmine_search` for global and project-scoped Redmine discovery.
- Added Search MCP tool input validation, unit coverage, and stdio end-to-end coverage.
- Added end-to-end workflow coverage across all read-only MCP tools.
- Added Search-to-Issue, Issue-list-to-detail, and Project-list-to-detail MCP workflow regression coverage.
- Added a stable six-tool `tools/list` contract for the v0.1.0 read-only surface.

### Changed

- Replaced per-tool raw Error message handling with a shared sanitized MCP error mapper.
- Limited MCP-visible errors to stable application-level information instead of exposing RedmineClient implementation details.
- Refactored MCP tool registration into dedicated read-only tool modules.
- Moved `redmine_get_current_user` out of the server composition root while preserving its existing MCP contract.
- Set v0.1.0 as the next development release target for the read-only MCP tool surface.
- Extended the read-only tool registry with Issue tools while preserving the existing Current User contract.
- Extended the read-only tool registry with Project tools while preserving existing Current User and Issue tool contracts.
- Extended the read-only tool registry with Search while preserving existing Current User, Issue, and Project tool contracts.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
