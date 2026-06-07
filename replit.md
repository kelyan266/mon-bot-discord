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

## Bot Dashboard (`artifacts/dashboard`)

React + Vite app at `/dashboard/`. Reads bot data via the API server.

**Pages:** Vue d'ensemble (KPIs + charts), Classement XP, Économie, Modération, Sondages.
**API routes** (`/api/bot/*`): `stats`, `leaderboard`, `economy`, `warnings`, `polls`, `guilds` — reads from `artifacts/discord-bot/data/*.json` directly.
**Features:** CSV export, PDF export, dark mode toggle, auto-refresh dropdown (5 min / 10 min / 30 min).
**Guild par défaut:** `1496898542424555562` — hardcodé dans `artifacts/dashboard/src/lib/constants.ts`.

## Discord Bot (`@workspace/discord-bot`)

Long-running Node.js process (not a web artifact). Built with `discord.js` v14.

Features:
- Slash commands: `/ping`, `/kick`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarnings`, `/delwarning`, `/purge`, `/slowmode`, `/userstats`, `/autorole set|clear|show`, `/snipe`, `/lock`, `/unlock`, `/embed`, `/help`, `/dm`, `/channelstats`, `/level`, `/leaderboard`, `/levelrole set|remove|list`, `/xp give|take|set|reset`, `/automod enable|disable|status`, `/levels enable|disable|status`, `/setavatar`, `/botrole set|clear|show`
- Admin XP commands (`/xp`, requires Manage Server): `give`, `take`, `set`, `reset` (per-user or whole-server with `confirm_server: true`). Uses `adjustXp/setXp/resetUserXp/resetGuildXp` in `levels.ts` which force-flush after each mutation.
- Levels/XP system: 15-25 XP per message (60s cooldown per user), 10 XP/min in voice (when ≥2 humans, not muted/deafened). Persisted to `data/levels.json` (debounced flush every 30s + on shutdown). Level-ups announced in the active channel. Formula: `xpForNextLevel(L) = 5L² + 50L + 100` (Mee6-style).
- Level role rewards: per-guild map `level → roleId` configured via `/levelrole`. Persisted to `data/levelRoles.json`. On level-up, all rewards up to and including the new level are granted (catches missed rewards). Skips roles above bot's highest role and managed/integration roles. DMs the user listing the roles received.
- `/snipe` shows the last deleted message in the current channel. Stored in-memory per channel with a 1-hour TTL.
- Auto-role on join: configurable per server via `/autorole set @role`. Persisted to `data/autoRoles.json`. Falls back to a role literally named `random` if nothing is configured.
- Auto anti-spam: weighted score (rate, duplicates, mass mentions, links). >= 1.0 triggers a 5-minute timeout + warning.
- Auto-mod exemptions: server owner, members with Manage Messages, and Nitro server boosters (`member.premiumSince !== null`) are skipped by both anti-spam and toxicity detection.
- AI toxicity detection: every message is scored 0-1 by `gpt-5-nano` via Replit AI Integrations. Score >= 0.8 deletes the message + warns; score >= 0.95 also issues a 10-minute timeout. Cached for 5 min and skipped for messages under 8 chars.
- After 3 total auto-warnings the user is auto-kicked.
- Warnings persist to `artifacts/discord-bot/data/warnings.json` (gitignored).
- Per-user runtime stats viewable with `/userstats`.

Env vars / secrets:
- `DISCORD_BOT_TOKEN` (secret, required)
- `DISCORD_GUILD_ID` (optional) — when set, slash commands are registered to that guild instantly. Without it they register globally and may take up to ~1 hour to appear.

The bot auto-syncs slash commands on startup. Workflow: "Discord Bot".

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
# redeploy
