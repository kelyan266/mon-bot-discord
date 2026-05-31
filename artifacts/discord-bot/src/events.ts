import { loadJson, saveJson } from "./persist.js";
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";

export interface EventRecord {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description: string;
  startTime: number;
  maxParticipants: number | null;
  participants: string[];
  reminderMinutes: number;
  reminderSent: boolean;
  status: "upcoming" | "ended" | "cancelled";
}

type EventsDb = Record<string, EventRecord>;

let cache: EventsDb | null = null;

async function load(): Promise<EventsDb> {
  if (cache) return cache;
  cache = await loadJson<EventsDb>("events.json", {});
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("events.json", cache);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function createEvent(
  data: Omit<EventRecord, "id" | "participants" | "reminderSent" | "status">,
): Promise<EventRecord> {
  const db = await load();
  const event: EventRecord = {
    ...data,
    id: generateId(),
    participants: [data.creatorId],
    reminderSent: false,
    status: "upcoming",
  };
  db[event.id] = event;
  await persist();
  return event;
}

export async function getEvent(
  guildId: string,
  id: string,
): Promise<EventRecord | null> {
  const db = await load();
  const e = db[id];
  return e && e.guildId === guildId ? e : null;
}

export async function getGuildEvents(guildId: string): Promise<EventRecord[]> {
  const db = await load();
  return Object.values(db)
    .filter((e) => e.guildId === guildId && e.status === "upcoming")
    .sort((a, b) => a.startTime - b.startTime);
}

export async function joinEvent(
  guildId: string,
  id: string,
  userId: string,
): Promise<"ok" | "not_found" | "already_joined" | "full" | "ended"> {
  const db = await load();
  const e = db[id];
  if (!e || e.guildId !== guildId) return "not_found";
  if (e.status !== "upcoming") return "ended";
  if (e.participants.includes(userId)) return "already_joined";
  if (e.maxParticipants !== null && e.participants.length >= e.maxParticipants)
    return "full";
  e.participants.push(userId);
  await persist();
  return "ok";
}

export async function leaveEvent(
  guildId: string,
  id: string,
  userId: string,
): Promise<"ok" | "not_found" | "not_joined"> {
  const db = await load();
  const e = db[id];
  if (!e || e.guildId !== guildId) return "not_found";
  const idx = e.participants.indexOf(userId);
  if (idx === -1) return "not_joined";
  e.participants.splice(idx, 1);
  await persist();
  return "ok";
}

export async function cancelEvent(
  guildId: string,
  id: string,
): Promise<boolean> {
  const db = await load();
  const e = db[id];
  if (!e || e.guildId !== guildId) return false;
  e.status = "cancelled";
  await persist();
  return true;
}

export async function getAllUpcoming(): Promise<EventRecord[]> {
  const db = await load();
  return Object.values(db).filter((e) => e.status === "upcoming");
}

async function markReminderSent(id: string): Promise<void> {
  const db = await load();
  if (db[id]) db[id]!.reminderSent = true;
  await persist();
}

async function markEnded(id: string): Promise<void> {
  const db = await load();
  if (db[id]) db[id]!.status = "ended";
  await persist();
}

export async function checkEventReminders(client: Client): Promise<void> {
  const now = Date.now();
  const events = await getAllUpcoming();

  for (const event of events) {
    const msUntilStart = event.startTime - now;
    const minutesUntilStart = msUntilStart / 60_000;

    if (msUntilStart <= 0) {
      await markEnded(event.id);
      continue;
    }

    if (!event.reminderSent && minutesUntilStart <= event.reminderMinutes) {
      await markReminderSent(event.id);

      const guild = client.guilds.cache.get(event.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(event.channelId);
      if (!channel?.isTextBased()) continue;

      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`⏰ Rappel — ${event.title}`)
        .setDescription(event.description)
        .addFields(
          {
            name: "Début",
            value: `<t:${Math.floor(event.startTime / 1000)}:R>`,
            inline: true,
          },
          {
            name: "Participants",
            value: `${event.participants.length}${event.maxParticipants ? `/${event.maxParticipants}` : ""} inscrits`,
            inline: true,
          },
          {
            name: "ID",
            value: `\`${event.id}\``,
            inline: true,
          },
        )
        .setFooter({ text: `Rappel envoyé ${event.reminderMinutes} min avant le début` })
        .setTimestamp();

      const mentions = event.participants.map((id) => `<@${id}>`).join(" ");
      await (channel as TextChannel)
        .send({ content: mentions || undefined, embeds: [embed] })
        .catch(() => undefined);
    }
  }
}

export function parseDateTimeToTimestamp(
  date: string,
  time: string,
): number | null {
  const [dayStr, monthStr, yearStr] = date.split("/");
  const [hourStr, minStr] = time.split(":");
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const hour = Number(hourStr);
  const min = Number(minStr);

  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    isNaN(hour) || isNaN(min) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    min < 0 || min > 59
  )
    return null;

  const ts = new Date(year, month - 1, day, hour, min, 0, 0).getTime();
  return isNaN(ts) ? null : ts;
}
