
# ADR-010: Provide deterministic local Redmine lifecycle commands

Status: Accepted  
Date: 2026-08-23

## Context

Integration and E2E tests need a reproducible Redmine environment that can be
rebuilt without manual database cleanup.

## Decision

Expose start, seed, reset, and stop operations through project npm scripts.

The reset path is the authoritative way to return the local test Redmine
environment to its deterministic baseline.

The lifecycle uses the Docker Compose configuration and synthetic seed model
defined by ADR-006.

## Consequences

Local development and CI share the same environment lifecycle concepts and can
recover from mutable test state consistently.
