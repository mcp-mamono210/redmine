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

### Changed

- Replaced per-tool raw Error message handling with a shared sanitized MCP error mapper.
- Limited MCP-visible errors to stable application-level information instead of exposing RedmineClient implementation details.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
