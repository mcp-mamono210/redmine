# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.0.1] - 2026-08-22

### Added

- Added the initial Node.js and TypeScript project structure.
- Added the MCP TypeScript SDK and initial MCP server factory.
- Added TypeScript build and type-check scripts.
- Added the Docker Redmine and PostgreSQL test environment.
- Added Redmine readiness support for local development and CI.
- Added npm scripts for starting and stopping the Docker Redmine environment.
- Added the initial Redmine configuration seed.
- Enabled the Redmine REST API through the configuration seed.
- Added the `MCP Read Only` role configuration.
- Added the initial Redmine test data seed.
- Added the `mcp-test` user and `MCP Test Project`.
- Added the MCP read-only project membership.
- Added a deterministic API token for the Docker test environment.
- Added npm scripts for running the configuration and test-data seeds.
- Added the initial Redmine REST API client.
- Added API key authentication using the `X-Redmine-API-Key` header.
- Added support for retrieving the current Redmine user.
- Added a RedmineClient integration test against Docker Redmine.
- Added the stdio MCP transport.
- Added the `redmine_get_current_user` MCP tool.
- Added MCP end-to-end testing over stdio against Docker Redmine.
- Added the CircleCI walking-skeleton workflow.

### Fixed

- Fixed deterministic test API token generation so Redmine's token callback does not replace the configured test token.
- Fixed the compiled MCP server path to use `dist/src/index.js`.
- Updated CircleCI dependency installation to work without a committed `package-lock.json`.
