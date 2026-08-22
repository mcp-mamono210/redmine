# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- Added the initial Node.js and TypeScript project structure.
- Added the MCP TypeScript SDK dependency.
- Added the initial MCP server factory.
- Added TypeScript build and type-check scripts.
- Added the initial Docker Redmine and PostgreSQL test environment.
- Added Redmine readiness support for local development.
- Added npm scripts for starting and stopping the Docker Redmine environment.
- Added the initial Redmine configuration seed.
- Enabled the Redmine REST API through the configuration seed.
- Added the `MCP Read Only` role configuration.
- Added an npm script for running the Redmine configuration seed.
- Added the initial Redmine test data seed.
- Added the `mcp-test` user and MCP test project.
- Added the MCP read-only project membership.
- Added a deterministic API token for the Docker test environment.
- Added npm scripts for running the test data seed and all Redmine seeds.
- Added example Redmine connection settings for local and CI testing.
- Added the initial Redmine REST API client.
- Added API key authentication using the `X-Redmine-API-Key` header.
- Added support for retrieving the current Redmine user.
- Added an integration test against the Docker Redmine environment.
- Added the stdio MCP transport.
- Added the `redmine_get_current_user` MCP tool.
- Added the MCP client SDK for end-to-end testing.
- Added MCP end-to-end testing against the Docker Redmine environment.
- Added walking-skeleton verification through the MCP protocol.
- Added the CircleCI walking-skeleton workflow.
