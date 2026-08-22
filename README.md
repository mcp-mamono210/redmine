# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

The project is progressing toward `v0.1.0`, which expands the initial walking skeleton into a read-only MCP server.

## TypeScript quality checks

The TypeScript quality baseline consists of ESLint, the TypeScript compiler, builds, Vitest, Docker Redmine integration tests, and MCP E2E tests.

Run ESLint:

```bash
npm run lint
```

Run the TypeScript compiler without emitting files:

```bash
npm run typecheck
```

Run lint and type checking together:

```bash
npm run check
```

Build the project:

```bash
npm run build
```

ESLint uses type-aware `typescript-eslint` rules for both production and test code.

The lint target includes:

```text
src/**/*.ts
tests/**/*.ts
```

Generated output and installed dependencies are excluded:

```text
dist/
node_modules/
```

External JSON and API responses should enter application code as `unknown` and be validated or normalized before being treated as typed internal data.

Explicit `any`, unsafe typed operations, floating promises, misused promises, and unused variables are rejected by the quality gate.

## TypeScript compiler baseline

The project keeps `strict` mode enabled and additionally enables:

```text
noUncheckedIndexedAccess
noImplicitReturns
noFallthroughCasesInSwitch
noUnusedLocals
noUnusedParameters
```

`exactOptionalPropertyTypes` is intentionally deferred until the Redmine response model and Zod schemas are established.

`skipLibCheck` remains enabled so the project quality gate focuses on application and test code rather than third-party declaration files.

## CircleCI quality gate

CircleCI verifies the following sequence:

```text
Dependency installation
↓
ESLint
↓
TypeScript typecheck
↓
TypeScript build
↓
Redmine reset
↓
RedmineClient integration test
↓
MCP stdio E2E
↓
Second Redmine reset
↓
Integration verification
```

A lint, typecheck, build, integration, or E2E failure fails the workflow.

## Local Redmine lifecycle

Start the existing environment while preserving the PostgreSQL volume:

```bash
npm run redmine:start
```

Apply configuration and representative test-data seeds:

```bash
npm run redmine:seed
```

Rebuild the environment from a clean PostgreSQL volume:

```bash
npm run redmine:reset
```

Stop the environment while preserving the PostgreSQL volume:

```bash
npm run redmine:stop
```

`redmine:reset` is destructive for the disposable local test environment.

## Next phase

The next phase formalizes Redmine response types and the RedmineClient error model before implementing the read-only Issue, Project, and Search MCP tools.

## License

MIT
