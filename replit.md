# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/discord-bot run start` — run the Discord moderation bot

## Discord Bot (`@workspace/discord-bot`)

Long-running Node.js process (not a web artifact). Built with `discord.js` v14.

Features:
- Slash commands: `/ping`, `/kick`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarnings`, `/delwarning`, `/purge`, `/slowmode`
- Auto anti-spam: rate limit (6 msg / 7s), repeated message detection, mass-mention guard. Triggers a 5-minute timeout + persistent warning. After 3 auto-warnings the user is auto-kicked.
- Warnings persist to `artifacts/discord-bot/data/warnings.json` (gitignored).

Env vars / secrets:
- `DISCORD_BOT_TOKEN` (secret, required)
- `DISCORD_GUILD_ID` (optional) — when set, slash commands are registered to that guild instantly. Without it they register globally and may take up to ~1 hour to appear.

The bot auto-syncs slash commands on startup. Workflow: "Discord Bot".

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
