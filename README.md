# Redmine MCP Server

A Model Context Protocol (MCP) server for interacting with Redmine.

This project is implemented in TypeScript using the official MCP TypeScript SDK.

## Status

This project is currently in the initial development stage.

The first release, `v0.0.1`, establishes the walking skeleton for the Redmine MCP Server.

The target end-to-end flow is:

```text
MCP Client
    ↓
stdio
    ↓
Redmine MCP Server
    ↓
Redmine Client
    ↓
Redmine REST API
    ↓
Redmine
    ↓
PostgreSQL
```

## Requirements

- Node.js 20 or later
- npm
- Docker Engine
- Docker Compose v2
- Bash
- curl

## Installation

Install Node.js dependencies with:

```bash
npm ci
```

If `package-lock.json` does not exist yet, run the following once:

```bash
npm install
```

## Build

Build the TypeScript sources with:

```bash
npm run build
```

Compiled files are written to:

```text
dist/
```

## Type Check

Run TypeScript type checking without emitting JavaScript:

```bash
npm run typecheck
```

## Run

After building the project, run the entry point with:

```bash
node dist/index.js
```

At this stage, the MCP transport and MCP tools are not implemented yet, so the process exits after creating the server instance.

## Docker Redmine Development Environment

The local test environment uses pinned Redmine and PostgreSQL Docker images.

Default versions:

```text
Redmine:    6.1.3
PostgreSQL: 17.10
```

The Docker environment is intended only for local development and automated testing. It does not contain production credentials or production Redmine data.

### Environment Variables

The Compose configuration has development-safe defaults. To override them, copy the example environment file:

```bash
cp .env.example .env
```

`.env` is ignored by Git.

### Start Redmine

Start PostgreSQL and Redmine and wait until the Redmine HTTP endpoint is ready:

```bash
npm run redmine:start
```

The default URL is:

```text
http://localhost:3000
```

The PostgreSQL container must pass its health check before the Redmine container starts.

### Wait for Redmine

To run only the HTTP readiness check:

```bash
npm run redmine:wait
```

The following environment variables control the readiness check:

```text
REDMINE_URL
REDMINE_PORT
REDMINE_WAIT_TIMEOUT
REDMINE_WAIT_INTERVAL
```

### Stop Redmine

Stop the containers while preserving Docker volumes:

```bash
npm run redmine:stop
```

The database and Redmine file volumes are intentionally preserved at this phase. A deterministic reset command will be added with the seed/reset workflow in a later phase.

### Run Rails Runner

Verify that Rails Runner can execute inside the Redmine container:

```bash
docker compose -f docker/compose.yml exec redmine \
  bin/rails runner 'puts Redmine::VERSION.to_s'
```

This execution path will be used by later phases to create deterministic Redmine configuration and test data.

## Docker Structure

```text
docker/
├── compose.yml
└── scripts/
    └── wait-for-redmine.sh
```

`docker/compose.yml` defines:

- a PostgreSQL service with a persistent named volume and health check
- a Redmine service connected to PostgreSQL
- a persistent Redmine files volume
- a configurable host port for Redmine

## Project Structure

```text
.
├── docker/
│   ├── compose.yml
│   └── scripts/
│       └── wait-for-redmine.sh
├── src/
│   ├── index.ts
│   └── server.ts
├── tests/
├── docs/
│   └── adr/
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Development Roadmap

The `v0.0.1` walking skeleton consists of the following phases:

1. Minimal TypeScript project
2. Docker-based Redmine and PostgreSQL environment
3. Minimal Redmine configuration seed
4. Minimal test data seed
5. Minimal Redmine client
6. `redmine_get_current_user` and MCP end-to-end test

## License

MIT License
