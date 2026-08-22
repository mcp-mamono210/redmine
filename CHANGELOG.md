# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added typed Redmine project detail and project list response models.
- Added RedmineClient support for project detail and project listing.
- Added support for project trackers and issue custom field metadata.
- Added typed Redmine version responses and project version listing.
- Added typed Redmine membership responses and project membership listing.
- Added Project API pagination support.
- Added Project API integration coverage against representative Docker Redmine data.
- Added typed 404 regression coverage for missing projects.

### Changed

- Preserved the existing Current User and Issue API contracts while extending RedmineClient with Project API operations.
- Normalized Redmine Project, Version, and Membership REST response fields to camelCase internal TypeScript models.

## [0.0.1] - 2026-08-22

### Added

- Added the initial Redmine MCP walking skeleton.
