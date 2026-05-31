import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const botDataTable = pgTable("bot_data", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type BotData = typeof botDataTable.$inferSelect;
