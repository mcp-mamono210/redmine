# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added typed Redmine issue detail and issue list response models.
- Added Zod validation for Redmine Issue API responses.
- Added RedmineClient support for issue retrieval and issue listing.
- Added Issue API filtering for project, tracker, status, assignee, fixed version, and subject.
- Added normalized pagination metadata for issue lists.
- Added support for issue journals, relations, custom fields, and allowed statuses.
- Added Issue API integration coverage against representative Docker Redmine data.
- Added 404 regression coverage for missing issues.

### Changed

- Preserved the existing typed current-user RedmineClient contract while adding Issue API support.
- Normalized Redmine Issue API snake_case response fields to camelCase internal TypeScript models.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
