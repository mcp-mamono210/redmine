# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

The project is currently in the `v0.0.1` walking-skeleton stage.

## Requirements

- Node.js 20 or later
- npm
- Docker
- Docker Compose

## Install dependencies

```bash
npm install
```

After `package-lock.json` has been generated and committed, use:

```bash
npm ci
```

## Build

```bash
npm run build
```

## Type check

```bash
npm run typecheck
```

## Docker Redmine

Start Redmine and PostgreSQL:

```bash
npm run redmine:start
```

Wait until Redmine is ready:

```bash
bash docker/scripts/wait-for-redmine.sh
```

Apply configuration and test-data seeds:

```bash
npm run redmine:seed
```

Stop the environment:

```bash
npm run redmine:stop
```

## Test environment

The seeded environment contains:

- REST API enabled
- `MCP Read Only` role
- `mcp-test` user
- `MCP Test Project`
- Project membership
- Deterministic test-only API token

The local MCP server expects:

```text
REDMINE_URL=http://localhost:3000
REDMINE_API_KEY=0123456789abcdef0123456789abcdef01234567
```

The API token above is intentionally fixed for the disposable local/CI test Redmine only. Never reuse it in production.

## Redmine client integration test

Run:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"
npm run test:integration
```

This verifies:

```text
RedmineClient
    ↓
GET /users/current.json
    ↓
Docker Redmine
    ↓
mcp-test
```

## MCP server

The server is exposed over stdio.

Build and run it with:

```bash
npm run build

REDMINE_URL="http://localhost:3000" \
REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567" \
node dist/src/index.js
```

`stdout` is reserved exclusively for MCP protocol traffic. Diagnostic output must use `stderr`.

## `redmine_get_current_user`

The walking skeleton exposes one MCP tool:

```text
redmine_get_current_user
```

It retrieves the Redmine user associated with the configured API key.

Use it to:

- Verify Redmine authentication.
- Determine the Redmine identity used by this MCP server.
- Obtain the current user's internal Redmine ID.

It does not search for arbitrary Redmine users.

## MCP E2E test

The E2E test launches the compiled MCP server as a child process and communicates with it over stdio.

Prepare Redmine first:

```bash
npm run redmine:start
bash docker/scripts/wait-for-redmine.sh
npm run redmine:seed
```

Then run:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"
npm run test:e2e
```

The E2E path is:

```text
MCP Client
    ↓
stdio
    ↓
Redmine MCP Server
    ↓
redmine_get_current_user
    ↓
RedmineClient
    ↓
Docker Redmine
    ↓
mcp-test
```

The test verifies both `tools/list` and `tools/call`.

## Walking-skeleton verification

With Docker Redmine already started and seeded:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"
npm run test:walking-skeleton
```

## CircleCI

The walking-skeleton workflow uses the CircleCI machine executor so Docker Compose, mounted seed files, and container execution behave like the local environment.

The CI workflow performs:

```text
npm ci
↓
typecheck
↓
Docker Redmine / PostgreSQL
↓
Redmine readiness check
↓
configuration + test-data seed
↓
RedmineClient integration test
↓
MCP stdio E2E
```

## Project structure

```text
.
├── .circleci/
│   └── config.yml
├── docker/
│   ├── compose.yml
│   ├── scripts/
│   │   └── wait-for-redmine.sh
│   └── seed/
│       ├── config.rb
│       └── data.rb
├── docs/
│   └── adr/
├── src/
│   ├── index.ts
│   ├── server.ts
│   └── redmine/
│       └── client.ts
├── tests/
│   ├── integration/
│   │   └── redmine-client.test.ts
│   └── e2e/
│       └── get-current-user.test.ts
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Walking skeleton roadmap

The `v0.0.1` walking skeleton consists of:

1. Minimal TypeScript project
2. Docker Redmine / PostgreSQL
3. Minimal configuration seed
4. Minimal test-data seed
5. Minimal Redmine client
6. `redmine_get_current_user` and MCP E2E

Phase 6 completes the walking skeleton.

## License

MIT
