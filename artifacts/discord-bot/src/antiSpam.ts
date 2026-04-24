import type { Message } from "discord.js";

interface UserActivity {
  timestamps: number[];
  lastContent: string;
  duplicateCount: number;
}

const RATE_LIMIT_WINDOW_MS = 7_000;
const RATE_LIMIT_SOFT = 4;
const RATE_LIMIT_HARD = 6;
const DUPLICATE_SOFT = 2;
const DUPLICATE_HARD = 3;
const MASS_MENTION_THRESHOLD = 5;
const SPAM_SCORE_THRESHOLD = 1.0;

const activity = new Map<string, UserActivity>();

interface UserStat {
  messages: number;
  totalScore: number;
  spamHits: number;
  lastSeen: number;
}

const userStats: Record<string, UserStat> = {};

export function getUserStats(
  guildId: string,
  userId: string,
): UserStat | undefined {
  return userStats[`${guildId}:${userId}`];
}

export function getAllUserStats(): Record<string, UserStat> {
  return userStats;
}

setInterval(
  () => {
    const cutoff = Date.now() - 60_000;
    for (const [key, value] of activity) {
      if (value.timestamps.every((t) => t < cutoff)) {
        activity.delete(key);
      }
    }
  },
  60_000,
).unref();

export type SpamReason =
  | "rate"
  | "duplicate"
  | "mass-mentions"
  | "links"
  | "mixed";

export interface SpamCheckResult {
  isSpam: boolean;
  score: number;
  reason?: SpamReason;
  detail?: string;
}

export function checkSpam(message: Message): SpamCheckResult {
  if (!message.guild || message.author.bot) {
    return { isSpam: false, score: 0 };
  }

  const content = message.content;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const entry: UserActivity = activity.get(key) ?? {
    timestamps: [],
    lastContent: "",
    duplicateCount: 0,
  };

  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  entry.timestamps.push(now);

  const normalized = content.trim().toLowerCase();
  if (normalized.length > 0 && normalized === entry.lastContent) {
    entry.duplicateCount += 1;
  } else {
    entry.duplicateCount = 1;
    entry.lastContent = normalized;
  }

  activity.set(key, entry);

  let score = 0;
  const contributors: SpamReason[] = [];
  const details: string[] = [];

  const mentionCount =
    message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MASS_MENTION_THRESHOLD) {
    score += 1.0;
    contributors.push("mass-mentions");
    details.push(`${mentionCount} mentions`);
  }

  const burst = entry.timestamps.length;
  if (burst >= RATE_LIMIT_HARD) {
    score += 1.0;
    contributors.push("rate");
    details.push(`${burst} msgs in ${RATE_LIMIT_WINDOW_MS / 1000}s`);
  } else if (burst >= RATE_LIMIT_SOFT) {
    score += 0.4;
    contributors.push("rate");
    details.push(`${burst} msgs in ${RATE_LIMIT_WINDOW_MS / 1000}s`);
  }

  if (entry.duplicateCount >= DUPLICATE_HARD) {
    score += 1.0;
    contributors.push("duplicate");
    details.push(`${entry.duplicateCount}x repeat`);
  } else if (entry.duplicateCount >= DUPLICATE_SOFT) {
    score += 0.4;
    contributors.push("duplicate");
    details.push(`${entry.duplicateCount}x repeat`);
  }

  if (content.includes("http")) score += 0.3;
  if (content.includes("http")) {
    contributors.push("links");
    details.push("contains link");
  }

  console.log(`${message.author.tag} -> score: ${score}`);

  const isSpam = score >= SPAM_SCORE_THRESHOLD;

  const stat = userStats[key] ?? {
    messages: 0,
    totalScore: 0,
    spamHits: 0,
    lastSeen: 0,
  };
  stat.messages += 1;
  stat.totalScore += score;
  stat.lastSeen = now;
  if (isSpam) stat.spamHits += 1;
  userStats[key] = stat;

  if (!isSpam) {
    return { isSpam: false, score };
  }

  const reason: SpamReason =
    contributors.length === 1 ? contributors[0]! : "mixed";

  return {
    isSpam: true,
    score,
    reason,
    detail: `score ${score.toFixed(2)} · ${details.join(", ")}`,
  };
}

export function resetActivity(guildId: string, userId: string): void {
  activity.delete(`${guildId}:${userId}`);
}
