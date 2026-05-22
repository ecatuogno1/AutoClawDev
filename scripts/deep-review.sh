#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_WORKER="$REPO_ROOT/apps/server/dist/workers/reviewWorker.js"
SRC_WORKER="$REPO_ROOT/apps/server/src/workers/reviewWorker.ts"

export AUTOCLAWDEV_REPO_ROOT="${AUTOCLAWDEV_REPO_ROOT:-$REPO_ROOT}"

if [ -f "$DIST_WORKER" ]; then
  exec node "$DIST_WORKER" "$@"
fi

exec pnpm --filter @autoclawdev/server exec tsx "$SRC_WORKER" "$@"
