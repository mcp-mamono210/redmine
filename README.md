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

Start the local Redmine and PostgreSQL environment:

```bash
npm run redmine:start
```

Redmine is available at:

```text
http://localhost:3000
```

Stop the environment:

```bash
npm run redmine:stop
```

## Seed Redmine

Apply both the configuration seed and the test-data seed:

```bash
npm run redmine:seed
```

This creates the minimum environment required by the walking skeleton, including:

- REST API enabled
- `MCP Read Only` role
- `mcp-test` user
- `MCP Test Project`
- Project membership
- Deterministic test API token

## Redmine client

Phase 5 adds the initial `RedmineClient`.

The client currently supports HTTP GET requests only.

It:

- Reads the Redmine base URL and API key from environment variables.
- Sends the API key in the `X-Redmine-API-Key` header.
- Sends `Accept: application/json`.
- Uses the Node.js built-in `fetch`.
- Rejects non-success HTTP responses.
- Does not include the API key in error messages.
- Provides `getCurrentUser()` for `GET /users/current.json`.

The following environment variables are required:

```text
REDMINE_URL=http://localhost:3000
REDMINE_API_KEY=<test-only-api-key>
```

The API key used in local and CI tests must be the deterministic test key created by the Phase 4 seed. Do not use a production or administrator API key.

## Integration test

The integration test talks directly to the Docker Redmine instance.

Prepare the environment first:

```bash
npm run redmine:start
npm run redmine:seed
```

Then load the test environment variables and run:

```bash
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

The expected current user is:

```text
mcp-test
```

This is a Redmine REST API integration test. It does not pass through MCP yet.

## Current project structure

```text
.
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
│   └── integration/
│       └── redmine-client.test.ts
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

## License

MIT
