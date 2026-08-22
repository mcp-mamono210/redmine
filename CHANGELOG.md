# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Expanded the Redmine configuration seed with deterministic trackers:
  - Bug
  - Feature
  - Task
- Added deterministic issue statuses:
  - New
  - In Progress
  - Resolved
  - Closed
- Added deterministic workflow transitions for the `MCP Read Only` role.
- Added the `release_tag` issue custom field configuration.
- Added deterministic issue priority enumerations:
  - Low
  - Normal
  - High

### Changed

- Expanded the `MCP Read Only` role configuration while keeping it free of write permissions.
- Clarified the boundary between Redmine configuration and representative test data.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Node.js and TypeScript project structure.
- Added the MCP TypeScript SDK and initial MCP server factory.
- Added TypeScript build and type-check scripts.
- Added the Docker Redmine and PostgreSQL test environment.
- Added Redmine readiness checks for local development and CircleCI.
- Added npm scripts for starting and stopping the Docker Redmine environment.
- Added the initial Redmine configuration seed.
- Enabled the Redmine REST API through the configuration seed.
- Added the `MCP Read Only` role.
- Added the initial Redmine test data seed.
- Added the `mcp-test` user.
- Added the `MCP Test Project`.
- Added project membership for the MCP test user.
- Added a deterministic API token for the disposable test environment.
- Added npm scripts for running configuration and test-data seeds.
- Added the initial `RedmineClient`.
- Added Redmine API key authentication using the `X-Redmine-API-Key` header.
- Added support for `GET /users/current.json`.
- Added a `RedmineClient` integration test against Docker Redmine.
- Added the MCP stdio transport.
- Added the `redmine_get_current_user` MCP tool.
- Added MCP end-to-end testing over stdio against Docker Redmine.
- Added a CircleCI walking-skeleton workflow covering Redmine startup, seed, integration testing, build, and MCP E2E testing.

### Fixed

- Fixed deterministic test API token creation so Redmine's token-generation callback does not replace the configured test token.
- Fixed the compiled MCP server entry-point path to use `dist/src/index.js`.
- Updated CircleCI dependency installation to work without a committed `package-lock.json`.
