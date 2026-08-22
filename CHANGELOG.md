# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
