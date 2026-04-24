import type { Message } from "discord.js";

interface UserActivity {
  timestamps: number[];
  lastContent: string;
  duplicateCount: number;
}

const RATE_LIMIT_WINDOW_MS = 7_000;
const RATE_LIMIT_MAX_MESSAGES = 6;
const DUPLICATE_THRESHOLD = 3;
const MASS_MENTION_THRESHOLD = 5;

const activity = new Map<string, UserActivity>();

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

export type SpamReason = "rate" | "duplicate" | "mass-mentions";

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: SpamReason;
  detail?: string;
}

export function checkSpam(message: Message): SpamCheckResult {
  if (!message.guild || message.author.bot) {
    return { isSpam: false };
  }

  const mentionCount =
    message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MASS_MENTION_THRESHOLD) {
    return {
      isSpam: true,
      reason: "mass-mentions",
      detail: `Mentioned ${mentionCount} users/roles in one message`,
    };
  }

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

  const normalized = message.content.trim().toLowerCase();
  if (normalized.length > 0 && normalized === entry.lastContent) {
    entry.duplicateCount += 1;
  } else {
    entry.duplicateCount = 1;
    entry.lastContent = normalized;
  }

  activity.set(key, entry);

  if (entry.timestamps.length > RATE_LIMIT_MAX_MESSAGES) {
    return {
      isSpam: true,
      reason: "rate",
      detail: `${entry.timestamps.length} messages in ${RATE_LIMIT_WINDOW_MS / 1000}s`,
    };
  }

  if (entry.duplicateCount >= DUPLICATE_THRESHOLD) {
    return {
      isSpam: true,
      reason: "duplicate",
      detail: `Posted the same message ${entry.duplicateCount} times in a row`,
    };
  }

  return { isSpam: false };
}

export function resetActivity(guildId: string, userId: string): void {
  activity.delete(`${guildId}:${userId}`);
}
