# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added typed Redmine search result responses.
- Added RedmineClient support for global and project-scoped search.
- Added normalized Search API pagination metadata.
- Added validation that rejects empty search queries before sending a Redmine request.
- Added Search API integration coverage for global search, project scope, subject and description discovery, pagination, and missing projects.
- Added API-key leak regression coverage for search results and errors.

### Changed

- Preserved the existing Current User, Issue API, and Project API contracts while extending RedmineClient with Search API support.
- Normalized nullable Redmine Search response fields to optional camelCase TypeScript properties.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
