import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  console.log("[Migration] Starting database migrations...");
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  try {
    const db = drizzle(pool);
    
    console.log("[Migration] Running migrations from ./drizzle folder...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    
    console.log("[Migration] ✅ Migrations completed successfully");
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("[Migration] ❌ Migration failed:", error?.message || error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
