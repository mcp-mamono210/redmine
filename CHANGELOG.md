# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added deterministic RedmineClient unit tests for HTTP, network, timeout, invalid JSON, empty response, and schema validation failures.
- Added explicit regression coverage preventing Redmine API keys from appearing in client error messages.
- Added real Redmine integration coverage for HTTP 401 and 404 error contracts.
- Added injectable `fetchImpl` support for deterministic RedmineClient tests.

### Changed

- Documented the RedmineClient error boundary between network, HTTP, and invalid-response failures.
- Kept raw HTTP response bodies out of client error messages while preserving Redmine `errors[]` messages when available.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
