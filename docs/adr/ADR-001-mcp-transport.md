
# ADR-001: Use stdio as the MCP transport

Status: Accepted  
Date: 2026-08-23

## Context

The server is intended to be launched by an MCP host as a local process.
Protocol messages therefore share the process standard streams with any
application diagnostics.

Writing diagnostics to stdout can corrupt the MCP protocol stream.

## Decision

Use MCP stdio transport.

- stdout is reserved exclusively for MCP protocol traffic
- diagnostics and operational logs use stderr or an explicitly configured file
- application source under `src/**` must not use `console.*`
- the server must not emit API keys, authorization values, passwords, or raw
  Redmine response bodies to the protocol stream

## Consequences

The process is simple to launch and integrate with MCP hosts, but stdout
discipline becomes a correctness and security requirement.

HTTP/SSE transport is not part of the current contract.
