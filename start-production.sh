#!/bin/sh
set -e

node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

pnpm --filter @workspace/discord-bot run start &
BOT_PID=$!

trap "kill $API_PID $BOT_PID 2>/dev/null" INT TERM

wait $API_PID $BOT_PID
