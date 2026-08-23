
# ADR-001: Use stdio as the MCP transport

Status: Accepted  
Date: 2026-08-23

## Context

The intended MCP host launches this server as a local child process.

A network transport would add listener lifecycle, network exposure,
authentication, and deployment concerns without solving a current product
requirement.

Protocol output also shares process standard streams with diagnostics, so
stdout discipline is required.

## Decision

Use MCP stdio transport.

- stdout is reserved exclusively for MCP protocol traffic
- diagnostics use stderr or an explicitly configured file
- application source must not write arbitrary console output to stdout
- secrets and raw backend responses must not enter the protocol stream

HTTP/SSE transport is outside the current architecture.

## Consequences

Local host integration stays simple and avoids an unnecessary network security
boundary.

Adding a network transport is a new architectural decision and requires a new
ADR rather than an incidental implementation change.
