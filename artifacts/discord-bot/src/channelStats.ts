interface ChannelEntry {
  count: number;
  lastSeen: number;
}

const stats: Record<string, Record<string, ChannelEntry>> = {};

export function recordChannelMessage(
  guildId: string,
  channelId: string,
): void {
  const guildStats = stats[guildId] ?? (stats[guildId] = {});
  const entry = guildStats[channelId] ?? { count: 0, lastSeen: 0 };
  entry.count += 1;
  entry.lastSeen = Date.now();
  guildStats[channelId] = entry;
}

export function getChannelStats(
  guildId: string,
): Array<{ channelId: string; count: number; lastSeen: number }> {
  const guildStats = stats[guildId];
  if (!guildStats) return [];
  return Object.entries(guildStats)
    .map(([channelId, entry]) => ({ channelId, ...entry }))
    .sort((a, b) => b.count - a.count);
}

export function getChannelStatsSummary(
  guildId: string,
): { totalMessages: number; activeChannels: number } {
  const list = getChannelStats(guildId);
  return {
    totalMessages: list.reduce((sum, c) => sum + c.count, 0),
    activeChannels: list.length,
  };
}
