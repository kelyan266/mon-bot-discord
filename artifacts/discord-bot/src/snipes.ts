export interface SnipedMessage {
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  content: string;
  attachments: string[];
  deletedAt: number;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const snipes = new Map<string, SnipedMessage>();

export function saveSnipe(channelId: string, message: SnipedMessage): void {
  snipes.set(channelId, message);
}

export function getSnipe(channelId: string): SnipedMessage | null {
  const snipe = snipes.get(channelId);
  if (!snipe) return null;
  if (Date.now() - snipe.deletedAt > TTL_MS) {
    snipes.delete(channelId);
    return null;
  }
  return snipe;
}

setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of snipes) {
      if (now - value.deletedAt > TTL_MS) snipes.delete(key);
    }
  },
  10 * 60 * 1000,
).unref();
