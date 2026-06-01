import "dotenv/config";
import { db, resultsTable, marketsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

async function checkDateRangeForActiveMarkets() {
  console.log("🔍 Checking Results for ACTIVE Markets\n");

  // Get all active markets
  const activeMarkets = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.isActive, true));

  const marketIds = activeMarkets.map(m => m.id);

  console.log(`Checking ${marketIds.length} active markets for date range:\n`);
  console.log("=".repeat(80));

  for (const market of activeMarkets) {
    const results = await db
      .select()
      .from(resultsTable)
      .where(eq(resultsTable.marketId, market.id));

    // Filter for June 1 and June 2
    const june1 = results.find(r => r.resultDate === "2026-06-01");
    const june2 = results.find(r => r.resultDate === "2026-06-02");

    console.log(`\n${market.name} (ID: ${market.id})`);
    console.log(`  June 1: ${june1 ? `✅ ${june1.openResult}-${june1.jodiResult}-${june1.closeResult}` : "❌ NOT FOUND"}`);
    console.log(`  June 2: ${june2 ? `✅ ${june2.openResult}-${june2.jodiResult}-${june2.closeResult}` : "❌ NOT FOUND"}`);
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("📊 SUMMARY");
  console.log("=".repeat(80));

  const allResults = await db
    .select()
    .from(resultsTable)
    .where(inArray(resultsTable.marketId, marketIds));

  const june1Results = allResults.filter(r => r.resultDate === "2026-06-01");
  const june2Results = allResults.filter(r => r.resultDate === "2026-06-02");

  console.log(`\nJune 1: ${june1Results.length} results`);
  console.log(`June 2: ${june2Results.length} results`);

  if (june2Results.length === 0) {
    console.log("\n⚠️  NO RESULTS FOR JUNE 2! Scheduler didn't run today.");
  }
}

checkDateRangeForActiveMarkets().catch(console.error);
