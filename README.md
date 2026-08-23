# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol
(MCP) server for Redmine.

The latest released version is **v0.1.1**.

The repository may contain changes for the next unreleased version. Exact
public MCP behavior for the current released read-only contract is documented
in:

```text
docs/contracts/read-only-mcp-contract.md
```

## Design goals

```text
Correct
+
Secure
+
Context-efficient
```

The MCP surface is intentionally narrow and domain-oriented. It is not a
generic Redmine REST proxy.

## Documentation roles

Use the documentation in this order:

1. `README.md` — project overview and development entry point
2. `docs/contracts/read-only-mcp-contract.md` — exact public MCP contract
3. `docs/adr/README.md` — ADR index and status
4. relevant ADR files — decision rationale and rejected alternatives

Do not duplicate exact tool lists, pagination limits, include values, or
response fields in overview documents. Those values belong in the contract
document.

Repository automation and coding agents should also read `AGENTS.md`.

## Runtime requirements

The exact supported Node.js runtime is defined by:

```text
.nvmrc
```

Current pinned runtime:

```text
Node.js 24.19.0
```

Use the same runtime locally and in CI:

```bash
nvm install
nvm use
node --version
npm --version
npm ci
```

`package.json` declares the same runtime through `engines.node`. CircleCI
installs and verifies the runtime from `.nvmrc` before running npm commands.

Docker and Docker Compose are required for integration and MCP E2E tests.

## Architecture

```text
src/
├── mcp/
│   ├── errors.ts
│   ├── register-tools.ts
│   ├── serialize.ts
│   └── tools/
├── redmine/
│   ├── client.ts
│   ├── errors.ts
│   ├── schemas.ts
│   └── types.ts
└── server.ts
```

Responsibilities:

- `src/redmine/` handles Redmine HTTP transport, validation, and internal
  TypeScript models.
- `src/mcp/tools/` defines MCP tool behavior.
- `src/mcp/serialize.ts` owns the public JSON naming boundary.
- `src/mcp/errors.ts` maps backend failures to sanitized MCP application
  errors.
- stdout is reserved for MCP protocol traffic.

## Read-only workflow

The read-only design separates compact discovery from detailed retrieval:

```text
discover / list
↓
select resource
↓
retrieve detail only when needed
```

Exact tool names and request/response contracts are defined only in
`docs/contracts/read-only-mcp-contract.md`.

## Context measurement

Context efficiency is measured deterministically using serialized UTF-8 bytes.

```bash
npm run context:measure
```

The exact measured scenarios are defined by the test suite. Context policy and
the reason for measuring bytes are documented in ADR-005.

## Local Redmine lifecycle

```bash
npm run redmine:start
npm run redmine:seed
npm run redmine:reset
npm run redmine:stop
```

The Docker environment uses deterministic synthetic fixtures. Production data
and production credentials must not be copied into the test environment.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

## License

MIT
