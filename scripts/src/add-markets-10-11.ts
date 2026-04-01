import "dotenv/config";
import { db, marketsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function addMarkets() {
  try {
    // Add market 10 - DELHI BAZAR
    await db.execute(
      sql`INSERT INTO markets (id, name, open_time, close_time, is_active) 
          VALUES (10, 'DELHI BAZAR', '00:00', '21:25', true) 
          ON CONFLICT (id) DO NOTHING`
    );
    console.log("✅ Market 10 (DELHI BAZAR) added/exists");

    // Add market 11 - GHAZIABAD
    await db.execute(
      sql`INSERT INTO markets (id, name, open_time, close_time, is_active) 
          VALUES (11, 'GHAZIABAD', '00:00', '21:25', true) 
          ON CONFLICT (id) DO NOTHING`
    );
    console.log("✅ Market 11 (GHAZIABAD) added/exists");

    // Verify
    const markets = await db.execute(sql`SELECT id, name FROM markets WHERE id IN (10, 11) ORDER BY id`);
    console.log("\n📊 Existing markets:");
    console.log(markets);
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

addMarkets();
