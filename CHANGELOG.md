# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added the initial Node.js and TypeScript project structure.
- Added the MCP TypeScript SDK dependency.
- Added the initial MCP server factory.
- Added TypeScript build and type-check scripts.
- Added the initial README, CHANGELOG, LICENSE, and ADR directory.
- Added a Docker Compose development environment with Redmine 6.1.3 and PostgreSQL 17.10.
- Added a PostgreSQL health check to gate Redmine startup.
- Added an HTTP readiness script for Redmine.
- Added npm scripts to start, wait for, and stop the local Redmine environment.
- Added an example environment file for Docker-based development settings.
- Documented the Rails Runner command used by later configuration and test-data seed phases.
