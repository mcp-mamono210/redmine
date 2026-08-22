# Redmine MCP Server

Redmine MCP Server is a TypeScript implementation of a Model Context Protocol (MCP) server for Redmine.

Version `0.0.1` provides the initial walking skeleton and proves the complete path from an MCP client to a Docker Redmine instance.

## v0.0.1 scope

The first release verifies the following path:

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
PostgreSQL
    ↓
mcp-test
```

The release intentionally exposes only one MCP tool:

```text
redmine_get_current_user
```

## Requirements

- Node.js 20 or later
- npm
- Docker
- Docker Compose

## Install dependencies

This repository does not use a committed `package-lock.json`.

Install dependencies with:

```bash
npm install --no-package-lock
```

CircleCI uses the same installation policy.

## Build

```bash
npm run build
```

The compiled MCP server entry point is:

```text
dist/src/index.js
```

Run it with:

```bash
npm start
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

## Seeded test environment

The local and CI test environment contains:

- Redmine REST API enabled
- `MCP Read Only` role
- `mcp-test` user
- `MCP Test Project`
- Project membership
- Deterministic test-only API token

The test connection uses:

```text
REDMINE_URL=http://localhost:3000
REDMINE_API_KEY=0123456789abcdef0123456789abcdef01234567
```

The API token above is valid only for the disposable local and CI test environment. Never reuse it in production.

## Redmine client integration test

Prepare Redmine:

```bash
npm run redmine:start
bash docker/scripts/wait-for-redmine.sh
npm run redmine:seed
```

Then run:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"

npm run test:integration
```

The integration test verifies:

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

The MCP server uses stdio transport.

Build and start it with:

```bash
npm run build

REDMINE_URL="http://localhost:3000" \
REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567" \
node dist/src/index.js
```

`stdout` is reserved exclusively for MCP protocol traffic. Diagnostic output must use `stderr`.

## `redmine_get_current_user`

`redmine_get_current_user` retrieves the Redmine user associated with the configured API key.

Use it to:

- Verify Redmine authentication.
- Determine which Redmine identity the MCP server is using.
- Obtain the current user's internal Redmine ID.

It does not search for arbitrary Redmine users.

## MCP E2E test

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

The E2E test verifies both `tools/list` and `tools/call` over stdio.

## Walking-skeleton verification

With Docker Redmine already started and seeded:

```bash
export REDMINE_URL="http://localhost:3000"
export REDMINE_API_KEY="0123456789abcdef0123456789abcdef01234567"

npm run test:walking-skeleton
```

## CircleCI

The CircleCI walking-skeleton workflow verifies:

```text
dependency installation
↓
typecheck
↓
Docker PostgreSQL / Redmine
↓
Redmine readiness
↓
configuration seed
↓
test-data seed
↓
RedmineClient integration test
↓
MCP stdio E2E
↓
build
```

The dependency-install step uses:

```bash
npm install --no-package-lock
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
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Next milestone

The next milestone is `v0.1.0`, which expands the read-only MCP implementation with representative Redmine configuration and data, formal response validation, and Issue / Project / Search tools.

## License

MIT
