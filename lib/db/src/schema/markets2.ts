import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const markets2Table = pgTable("markets2", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  openTime: text("open_time").notNull(),
  closeTime: text("close_time").notNull(),
  holidayDay: text("holiday_day"),
  isActive: boolean("is_active").notNull().default(true),
  openResult: text("open_result"),
  closeResult: text("close_result"),
  jodiResult: text("jodi_result"),
  autoUpdate: boolean("auto_update").notNull().default(false),
  sourceUrl: text("source_url"),
  lastFetchedAt: timestamp("last_fetched_at"),
  fetchError: text("fetch_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarkets2Schema = createInsertSchema(markets2Table).omit({ id: true, createdAt: true });
export type InsertMarkets2 = z.infer<typeof insertMarkets2Schema>;
export type Markets2 = typeof markets2Table.$inferSelect;
