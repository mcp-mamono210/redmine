#!/usr/bin/env bash

set -euo pipefail

COMPOSE_FILE="docker/compose.yml"

echo "Stopping Redmine test environment and removing volumes..."
docker compose -f "${COMPOSE_FILE}" down --volumes

echo "Starting Redmine test environment..."
npm run redmine:start

echo "Waiting for Redmine to become ready..."
bash docker/scripts/wait-for-redmine.sh

echo "Applying Redmine configuration and representative test data..."
npm run redmine:seed

echo "Redmine test environment reset completed."
