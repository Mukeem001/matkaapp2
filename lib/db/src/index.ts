import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set!");
  throw new Error("DATABASE_URL must be set");
}

console.log("[DB] Initializing database connection...");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render uses self-signed certs
});

pool.on("error", (error) => {
  console.error("[DB Pool Error]", error);
});

pool.on("connect", () => {
  console.log("[DB] ✅ Database connection established");
});

export const db = drizzle(pool, { schema });

export * from "./schema";