#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22 or later is required. Install it from https://nodejs.org then run this file again.'
  read '?Press Enter to close.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci --cache .data/npm-cache --no-fund --no-audit
fi
echo "Groundwork is starting. Open ${APP_ORIGIN:-http://127.0.0.1:4310} in your browser."
echo 'Keep this terminal open. Press Ctrl+C to stop the server.'
if [ -f .env ]; then
  exec node --env-file=.env --import tsx src/server.ts
else
  exec node --import tsx src/server.ts
fi
