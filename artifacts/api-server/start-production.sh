#!/bin/sh
# Production entrypoint — starts the Discord bot in background,
# then the API server in foreground (Replit monitors it for health).

# Start Discord bot in background
pnpm --filter @workspace/discord-bot run start &
BOT_PID=$!

# Forward SIGTERM/INT to the bot when the API server exits
cleanup() {
  kill "$BOT_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Start API server in foreground
exec node --enable-source-maps ./dist/index.mjs
