import { pgTable, serial, text, timestamp, boolean, integer, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const noticesTable = pgTable("notices", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  userId: integer("user_id"), // NULL = broadcast to all users, not NULL = specific user
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userFk: foreignKey({ columns: [table.userId], foreignColumns: [usersTable.id] }).onDelete("set null"),
}));

export const insertNoticeSchema = createInsertSchema(noticesTable).omit({ id: true, createdAt: true });
export type InsertNotice = z.infer<typeof insertNoticeSchema>;
export type Notice = typeof noticesTable.$inferSelect;
