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

The local test environment uses pinned Redmine and PostgreSQL container images.

Start the environment:

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

## Configuration seed

Redmine configuration is managed separately from test data.

Configuration contains application behavior and constraints such as:

- Settings
- Trackers
- Issue statuses
- Roles
- Workflow transitions
- Workflow permissions
- Custom fields
- Enumerations

Run the configuration seed with:

```bash
npm run redmine:seed:config
```

The current configuration seed:

- Enables the Redmine REST API.
- Ensures that the `MCP Read Only` role exists.

## Test data seed

Test data contains operational objects used by integration and MCP E2E tests.

Run the test data seed with:

```bash
npm run redmine:seed:data
```

The current test data seed creates or ensures:

- User: `mcp-test`
- Project: `MCP Test Project` (`mcp-test`)
- Membership using the `MCP Read Only` role
- A deterministic API token for the local/CI Docker test environment

The deterministic API token is:

```text
0123456789abcdef0123456789abcdef01234567
```

This token is intentionally fixed so local development and CI can use the same credentials.

It is valid only for the seeded test Redmine environment and must never be reused in production.

## Run all seeds

Configuration must be applied before test data.

Run both seeds in the correct order with:

```bash
npm run redmine:seed
```

This executes:

```text
config.rb
↓
data.rb
```

## Verify REST API authentication

After starting and seeding Redmine:

```bash
curl \
  -H "X-Redmine-API-Key: 0123456789abcdef0123456789abcdef01234567" \
  http://localhost:3000/users/current.json
```

The response should identify the current user as `mcp-test`.

## Environment variables

Copy `.env.example` to `.env` if local overrides are required.

```bash
cp .env.example .env
```

The example credentials are test-only values. Do not place production Redmine credentials in the repository.

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
│   └── server.ts
├── tests/
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
