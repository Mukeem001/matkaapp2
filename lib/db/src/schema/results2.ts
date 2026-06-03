import { pgTable, serial, text, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { markets2Table } from "./markets2";

/**
 * Historical results for Markets2
 * Stores all past results per market per date
 * Example: DELHI BAZAR on 2024-04-07 had result "71"
 * 
 * Foreign key with CASCADE delete ensures results are automatically deleted
 * when a market is deleted
 */
export const results2Table = pgTable("results_2", {
  id: serial("id").primaryKey(),
  marketId: integer("market_id").notNull().references(() => markets2Table.id, { onDelete: "cascade" }),
  resultDate: date("result_date").notNull(),
  result: text("result").notNull(), // 2-digit number (00-99) or "XX"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertResults2Schema = createInsertSchema(results2Table).omit({ id: true, createdAt: true });
export type InsertResults2 = z.infer<typeof insertResults2Schema>;
export type Results2 = typeof results2Table.$inferSelect;
