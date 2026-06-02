import { db, markets2Table, results2Table } from "@workspace/db";
import { eq, like } from "drizzle-orm";

async function debug() {
  try {
    // Get SINGAPUR market
    const market = await db
      .select()
      .from(markets2Table)
      .where(like(markets2Table.name, "%SINGAPUR%"))
      .then(r => r[0]);

    console.log("\n=== SINGAPUR MARKET ===");
    console.log("Market:", market?.name);
    console.log("ID:", market?.id);
    console.log("Current Result:", {
      open: market?.openResult,
      jodi: market?.jodiResult,
      close: market?.closeResult
    });

    // Get today's results
    if (market) {
      const today = new Date().toISOString().split('T')[0];
      const result = await db
        .select()
        .from(results2Table)
        .where(eq(results2Table.marketId, market.id))
        .then(r => r[0]);

      console.log("\nToday's saved result:", result);
    }
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

debug();
