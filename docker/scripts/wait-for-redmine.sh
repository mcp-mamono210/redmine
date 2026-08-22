#!/usr/bin/env bash
set -euo pipefail

# Wait until the Redmine HTTP endpoint is ready to accept requests.
REDMINE_URL="${REDMINE_URL:-http://localhost:${REDMINE_PORT:-3000}}"
REDMINE_WAIT_TIMEOUT="${REDMINE_WAIT_TIMEOUT:-180}"
REDMINE_WAIT_INTERVAL="${REDMINE_WAIT_INTERVAL:-3}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to check Redmine readiness." >&2
  exit 1
fi

start_time="$(date +%s)"

echo "Waiting for Redmine at ${REDMINE_URL}..." >&2

while true; do
  if curl --silent --show-error --fail --location --max-time 5 \
    --output /dev/null "${REDMINE_URL}"; then
    echo "Redmine is ready at ${REDMINE_URL}." >&2
    exit 0
  fi

  current_time="$(date +%s)"
  elapsed="$((current_time - start_time))"

  if (( elapsed >= REDMINE_WAIT_TIMEOUT )); then
    echo "Timed out after ${REDMINE_WAIT_TIMEOUT}s waiting for Redmine at ${REDMINE_URL}." >&2
    exit 1
  fi

  sleep "${REDMINE_WAIT_INTERVAL}"
done
