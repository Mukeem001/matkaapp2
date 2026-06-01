import "dotenv/config";
import { db, marketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTodayDateIST } from "../../src/lib/date-utils";

async function checkMarketActiveStatus() {
  console.log("🔍 Checking Market Active Status\n");

  // Get all markets
  const allMarkets = await db.select().from(marketsTable);

  // Filter by isActive
  const activeMarkets = allMarkets.filter(m => m.isActive);
  const inactiveMarkets = allMarkets.filter(m => !m.isActive);

  console.log(`Total Markets: ${allMarkets.length}`);
  console.log(`✅ Active: ${activeMarkets.length}`);
  console.log(`❌ Inactive: ${inactiveMarkets.length}\n`);

  console.log("=".repeat(70));
  console.log("📋 ACTIVE MARKETS:");
  console.log("=".repeat(70));

  activeMarkets.forEach(m => {
    console.log(`\n${m.name} (ID: ${m.id})`);
    console.log(`  isActive: ${m.isActive}`);
    console.log(`  Current Result: ${m.openResult}-${m.jodiResult}-${m.closeResult}`);
    console.log(`  Last Updated: ${m.lastFetchedAt}`);
  });

  console.log("\n\n" + "=".repeat(70));
  console.log("📋 INACTIVE MARKETS:");
  console.log("=".repeat(70));

  inactiveMarkets.forEach(m => {
    console.log(`\n${m.name} (ID: ${m.id})`);
    console.log(`  isActive: ${m.isActive}`);
  });
}

checkMarketActiveStatus().catch(console.error);
