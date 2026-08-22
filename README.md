# Redmine MCP Server

A Model Context Protocol (MCP) server for interacting with Redmine.

This project is implemented in TypeScript using the official MCP TypeScript SDK.

## Status

This project is currently in the initial development stage.

The first release, `v0.0.1`, will establish the walking skeleton for the Redmine MCP Server.

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
```

## Requirements

- Node.js 20 or later
- npm

## Installation

Install dependencies with:

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

## Project Structure

```text
.
├── src/
│   ├── index.ts
│   └── server.ts
├── tests/
├── docs/
│   └── adr/
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Development Roadmap

The `v0.0.1` walking skeleton will implement the following phases:

1. Minimal TypeScript project
2. Docker-based Redmine and PostgreSQL environment
3. Minimal Redmine configuration seed
4. Minimal test data seed
5. Minimal Redmine client
6. `redmine_get_current_user` and MCP end-to-end test

## License

MIT License
