import { loadJson, saveJson } from "./persist.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

export interface Poll {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  createdAt: number;
  creatorId: string;
  ended: boolean;
}

interface PollsDb {
  polls: Record<string, Poll>;
}

let cache: PollsDb | null = null;

async function ensureLoaded(): Promise<PollsDb> {
  if (cache) return cache;
  cache = await loadJson<PollsDb>("polls.json", { polls: {} });
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("polls.json", cache);
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function countVotes(poll: Poll): number[] {
  const counts = new Array(poll.options.length).fill(0) as number[];
  for (const idx of Object.values(poll.votes)) {
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts;
}

function progressBar(ratio: number, width = 14): string {
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function buildPollEmbed(poll: Poll): EmbedBuilder {
  const votes = countVotes(poll);
  const total = votes.reduce((a, b) => a + b, 0);

  const lines = poll.options.map((opt, i) => {
    const v = votes[i] ?? 0;
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    const bar = progressBar(total > 0 ? v / total : 0);
    return `**${i + 1}. ${opt}**\n${bar} ${pct}% — **${v}** vote${v !== 1 ? "s" : ""}`;
  });

  const embed = new EmbedBuilder()
    .setColor(poll.ended ? 0x95a5a6 : 0x5865f2)
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines.join("\n\n"))
    .addFields({ name: "Votes totaux", value: `**${total}**`, inline: true })
    .setFooter({
      text: poll.ended
        ? `Sondage terminé · ID: ${poll.id}`
        : `Vote en cours · ID: ${poll.id} · Clique pour voter`,
    })
    .setTimestamp(poll.createdAt);

  return embed;
}

export function buildPollComponents(
  poll: Poll,
): ActionRowBuilder<ButtonBuilder>[] {
  if (poll.ended) return [];
  const EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
  const chunks: ButtonBuilder[][] = [];
  const btns = poll.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`poll_${poll.id}_${i}`)
      .setLabel(opt.slice(0, 80))
      .setEmoji(EMOJIS[i] ?? "🔵")
      .setStyle(ButtonStyle.Primary),
  );
  for (let i = 0; i < btns.length; i += 5) {
    chunks.push(btns.slice(i, i + 5));
  }
  return chunks.map((c) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(...c),
  );
}

export async function createPoll(
  guildId: string,
  channelId: string,
  creatorId: string,
  question: string,
  options: string[],
): Promise<Poll> {
  const db = await ensureLoaded();
  const poll: Poll = {
    id: randomId(),
    guildId,
    channelId,
    question,
    options,
    votes: {},
    createdAt: Date.now(),
    creatorId,
    ended: false,
  };
  db.polls[poll.id] = poll;
  await persist();
  return poll;
}

export async function getPoll(pollId: string): Promise<Poll | null> {
  const db = await ensureLoaded();
  return db.polls[pollId] ?? null;
}

export async function setPollMessage(
  pollId: string,
  messageId: string,
): Promise<void> {
  const db = await ensureLoaded();
  if (db.polls[pollId]) {
    db.polls[pollId].messageId = messageId;
    await persist();
  }
}

export async function castVote(
  pollId: string,
  userId: string,
  optionIndex: number,
): Promise<{ toggled: boolean; poll: Poll | null }> {
  const db = await ensureLoaded();
  const poll = db.polls[pollId];
  if (!poll || poll.ended) return { toggled: false, poll: null };

  if (poll.votes[userId] === optionIndex) {
    delete poll.votes[userId];
  } else {
    poll.votes[userId] = optionIndex;
  }
  await persist();
  return { toggled: true, poll };
}

export async function endPoll(pollId: string): Promise<Poll | null> {
  const db = await ensureLoaded();
  const poll = db.polls[pollId];
  if (!poll) return null;
  poll.ended = true;
  await persist();
  return poll;
}
