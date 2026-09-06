#!/usr/bin/env bash

set -euo pipefail

cleanup() {
  npm run redmine:stop >/dev/null 2>&1 || true
}

trap cleanup EXIT

run_with_fresh_redmine() {
  npm run redmine:reset
  "$@"
}

echo "Building TypeScript once for E2E and Context Budget reproducibility checks..."
npm run build

echo "Running Integration reproducibility pass 1..."
run_with_fresh_redmine npm run test:integration

echo "Running Integration reproducibility pass 2..."
run_with_fresh_redmine npm run test:integration

echo "Running MCP E2E reproducibility pass 1..."
run_with_fresh_redmine npm run test:e2e:ci

echo "Running MCP E2E reproducibility pass 2..."
run_with_fresh_redmine npm run test:e2e:ci

echo "Running Context Budget reproducibility pass 1..."
run_with_fresh_redmine npm run context:measure:ci

echo "Running Context Budget reproducibility pass 2..."
run_with_fresh_redmine npm run context:measure:ci

echo "Deterministic reproducibility gate passed."
