import "dotenv/config";
import { db, marketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchAndUpdateMarketResult } from "../../src/lib/scraper";

async function bulkUpdateActiveMarkets() {
  console.log("🔄 Bulk Update: Fetching Today's Results for All Active Markets\n");

  // Get all active markets
  const activeMarkets = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.isActive, true));

  console.log(`Found ${activeMarkets.length} active markets\n`);
  console.log("=".repeat(80));

  const results: { market: string; success: boolean; message: string }[] = [];

  for (const market of activeMarkets) {
    console.log(`\n📊 Updating: ${market.name} (ID: ${market.id})`);

    try {
      const result = await fetchAndUpdateMarketResult(market.id);
      const success = result.success;
      const message = result.message || "Unknown";

      console.log(`   Status: ${success ? "✅" : "❌"} ${message}`);

      results.push({
        market: market.name,
        success,
        message,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`   Status: ❌ ${errorMsg}`);

      results.push({
        market: market.name,
        success: false,
        message: errorMsg,
      });
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(80));
  console.log("📋 SUMMARY");
  console.log("=".repeat(80));

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log(`\n✅ Success: ${successCount}/${results.length}`);
  console.log(`❌ Failed: ${failureCount}/${results.length}`);

  if (failureCount > 0) {
    console.log("\nFailed Markets:");
    results.filter(r => !r.success).forEach(r => {
      console.log(`  • ${r.market}: ${r.message}`);
    });
  }

  console.log("\n✅ Bulk update completed!\n");
}

bulkUpdateActiveMarkets().catch(console.error);
