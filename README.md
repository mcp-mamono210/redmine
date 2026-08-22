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

Test data contains operational objects such as:

- Users
- Projects
- Versions
- Memberships
- Issues
- Journals
- Relations
- API tokens

Phase 3 provides the minimal configuration seed required for the walking skeleton.

Run it after Redmine has started:

```bash
npm run redmine:seed:config
```

The seed currently performs the following actions:

- Enables the Redmine REST API.
- Ensures that the `MCP Read Only` role exists.
- Restricts that role to the minimum permissions required by the walking skeleton.

The seed is executed with `rails runner` inside the Redmine container.

Equivalent command:

```bash
docker compose -f docker/compose.yml exec -T redmine \
  bin/rails runner /seed/config.rb
```

The `docker/seed` directory is mounted read-only into the Redmine container at `/seed`.

## Current project structure

```text
.
├── docker/
│   ├── compose.yml
│   ├── scripts/
│   │   └── wait-for-redmine.sh
│   └── seed/
│       └── config.rb
├── docs/
│   └── adr/
├── src/
│   ├── index.ts
│   └── server.ts
├── tests/
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
