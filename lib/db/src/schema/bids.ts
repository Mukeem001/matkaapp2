import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { marketsTable } from "./markets";

export const bidsTable = pgTable("bids", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  marketId: integer("market_id").notNull().references(() => marketsTable.id),
  marketName: text("market_name").default(""),
  gameType: text("game_type").notNull(), // single_digit, jodi, single_panna, double_panna, triple_panna, half_sangam, full_sangam
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  number: text("number").notNull(),
  marketopenclose: text("market_open_close").default("open-bids"), // open-bids, close-bids, full-sangam, Open Ank - Close Patti, Open Patti - Close Ank
  openTime: text("open_time").default(""),
  closeTime: text("close_time").default(""),
  currentTime: timestamp("current_time").defaultNow(),
  status: text("status").notNull().default("pending"), // pending, won, lost
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBidSchema = createInsertSchema(bidsTable).omit({ id: true, createdAt: true });
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Bid = typeof bidsTable.$inferSelect;
