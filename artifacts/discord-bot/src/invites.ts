/**
 * invites.ts — Système de suivi des invitations
 *
 * Détecte quelle invitation a été utilisée quand un membre rejoint,
 * et maintient des statistiques par inviteur (total, présents, partis).
 *
 * Nécessite : MANAGE_GUILD (pour lire guild.invites)
 */
import type { Guild, GuildMember } from "discord.js";
import { loadJson, saveJson } from "./persist.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface InviteeRecord {
  invitedAt: number;
  left: boolean;
}

interface InviterStats {
  invitees: Record<string, InviteeRecord>; // inviteeId → record
}

interface GuildData {
  stats: Record<string, InviterStats>; // inviterId → stats
  joinedVia: Record<string, string>;   // inviteeId → inviterId
}

type InviteDb = Record<string, GuildData>; // guildId → data

// ─────────────────────────────────────────────
// In-memory cache : guildId → Map<code, {uses, inviterId}>
// ─────────────────────────────────────────────

const inviteCache = new Map<string, Map<string, { uses: number; inviterId: string }>>();

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

let db: InviteDb | null = null;

async function loadDb(): Promise<InviteDb> {
  if (db) return db;
  db = await loadJson<InviteDb>("invites.json", {});
  return db;
}

async function saveDb(): Promise<void> {
  if (db) await saveJson("invites.json", db);
}

function ensureGuild(data: InviteDb, guildId: string): GuildData {
  if (!data[guildId]) data[guildId] = { stats: {}, joinedVia: {} };
  return data[guildId]!;
}

// ─────────────────────────────────────────────
// Cache management
// ─────────────────────────────────────────────

/** Appeler à ClientReady pour chaque serveur. */
export async function initInviteCache(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, { uses: number; inviterId: string }>();
    for (const invite of invites.values()) {
      if (!invite.inviter) continue;
      map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
    }
    inviteCache.set(guild.id, map);
  } catch {
    // Pas de MANAGE_GUILD — on continue sans tracking
    inviteCache.set(guild.id, new Map());
  }
}

/** Mettre à jour l'entrée du cache quand une invitation est créée/mise à jour. */
export function updateInviteCacheEntry(
  guildId: string,
  code: string,
  uses: number,
  inviterId: string,
): void {
  const map = inviteCache.get(guildId) ?? new Map();
  map.set(code, { uses, inviterId });
  inviteCache.set(guildId, map);
}

/** Retirer une invitation du cache quand elle est supprimée. */
export function removeFromInviteCache(guildId: string, code: string): void {
  inviteCache.get(guildId)?.delete(code);
}

// ─────────────────────────────────────────────
// Member join / leave
// ─────────────────────────────────────────────

/**
 * Détecter quelle invitation a été utilisée en comparant les compteurs
 * avant/après le join.
 * @returns userId de l'inviteur, ou null si non détecté.
 */
export async function handleInviteMemberJoin(member: GuildMember): Promise<string | null> {
  const guild = member.guild;
  const cached = inviteCache.get(guild.id) ?? new Map<string, { uses: number; inviterId: string }>();

  let usedInviterId: string | null = null;

  try {
    const freshInvites = await guild.invites.fetch();

    for (const invite of freshInvites.values()) {
      if (!invite.inviter) continue;
      const prev = cached.get(invite.code);
      const freshUses = invite.uses ?? 0;

      if (!prev || freshUses > prev.uses) {
        usedInviterId = invite.inviter.id;
      }
      // Always update cache with fresh data
      cached.set(invite.code, { uses: freshUses, inviterId: invite.inviter.id });
    }

    inviteCache.set(guild.id, cached);
  } catch {
    return null;
  }

  if (!usedInviterId) return null;

  // Persist
  const data = await loadDb();
  const gdata = ensureGuild(data, guild.id);
  gdata.joinedVia[member.id] = usedInviterId;
  if (!gdata.stats[usedInviterId]) {
    gdata.stats[usedInviterId] = { invitees: {} };
  }
  gdata.stats[usedInviterId]!.invitees[member.id] = {
    invitedAt: Date.now(),
    left: false,
  };
  await saveDb();

  return usedInviterId;
}

/** Marquer un membre comme parti pour l'inviteur qui l'avait fait entrer. */
export async function handleInviteMemberLeave(member: GuildMember): Promise<void> {
  const data = await loadDb();
  const gdata = data[member.guild.id];
  if (!gdata) return;

  const inviterId = gdata.joinedVia[member.id];
  if (!inviterId) return;

  const record = gdata.stats[inviterId]?.invitees[member.id];
  if (record) record.left = true;

  await saveDb();
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

export async function getInviteStats(
  guildId: string,
  userId: string,
): Promise<{ total: number; current: number; left: number }> {
  const data = await loadDb();
  const stats = data[guildId]?.stats[userId];
  if (!stats) return { total: 0, current: 0, left: 0 };

  const invitees = Object.values(stats.invitees);
  const total = invitees.length;
  const left = invitees.filter((i) => i.left).length;
  return { total, current: total - left, left };
}

export async function getTopInviters(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; total: number; current: number; left: number }>> {
  const data = await loadDb();
  const gdata = data[guildId];
  if (!gdata) return [];

  return Object.entries(gdata.stats)
    .map(([userId, stats]) => {
      const invitees = Object.values(stats.invitees);
      const total = invitees.length;
      const left = invitees.filter((i) => i.left).length;
      return { userId, total, current: total - left, left };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.current - a.current || b.total - a.total)
    .slice(0, limit);
}

/** Remettre à zéro les stats d'un inviteur (admin). */
export async function resetInviteStats(guildId: string, userId: string): Promise<void> {
  const data = await loadDb();
  const gdata = data[guildId];
  if (!gdata) return;
  delete gdata.stats[userId];
  // Remove joinedVia entries that point to this inviter
  for (const [inviteeId, inviterId] of Object.entries(gdata.joinedVia)) {
    if (inviterId === userId) delete gdata.joinedVia[inviteeId];
  }
  await saveDb();
}
