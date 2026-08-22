# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Expanded the Redmine configuration seed with deterministic trackers, statuses, workflows, custom fields, and priorities.
- Expanded deterministic Redmine test data with representative projects, versions, issues, journals, and relations.
- Added a local Redmine reset workflow that rebuilds the Docker test environment from a clean PostgreSQL volume.
- Added ESLint with type-aware TypeScript static analysis.
- Added a TypeScript quality gate for linting, type checking, and builds.
- Added an `npm run check` command for local lint and type-check verification.

### Changed

- Clarified the boundary between Redmine configuration and representative test data.
- Documented the local Redmine lifecycle for start, seed, reset, and stop operations.
- Strengthened TypeScript compiler checks with unchecked-index, return-path, fallthrough, and unused-code validation.
- Added TypeScript linting and an explicit build step to the CircleCI workflow.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Node.js and TypeScript project structure.
- Added the MCP TypeScript SDK and initial MCP server factory.
- Added TypeScript build and type-check scripts.
- Added the Docker Redmine and PostgreSQL test environment.
- Added Redmine readiness checks for local development and CircleCI.
- Added the initial Redmine configuration and test-data seeds.
- Added the `mcp-test` user and `MCP Test Project`.
- Added a deterministic API token for the disposable test environment.
- Added the initial `RedmineClient`.
- Added the MCP stdio transport.
- Added the `redmine_get_current_user` MCP tool.
- Added MCP end-to-end testing over stdio against Docker Redmine.
- Added a CircleCI walking-skeleton workflow.

### Fixed

- Fixed deterministic test API token creation so Redmine's token-generation callback does not replace the configured test token.
- Fixed the compiled MCP server entry-point path to use `dist/src/index.js`.
- Updated CircleCI dependency installation to work without a committed `package-lock.json`.
