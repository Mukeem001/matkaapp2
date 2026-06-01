import "dotenv/config";
import { db, marketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function checkMarketAutoUpdate() {
  console.log("🔍 Checking Market Auto-Update Configuration\n");

  const markets = await db.select().from(marketsTable);

  console.log(`Total Markets: ${markets.length}\n`);
  console.log("=".repeat(70));

  const withAutoUpdate = markets.filter(m => m.autoUpdate);
  const withoutAutoUpdate = markets.filter(m => !m.autoUpdate);
  const withSourceUrl = markets.filter(m => m.sourceUrl);
  const withAutoButNoUrl = markets.filter(m => m.autoUpdate && !m.sourceUrl);

  console.log(`\n✅ autoUpdate = true: ${withAutoUpdate.length}`);
  console.log(`❌ autoUpdate = false: ${withoutAutoUpdate.length}`);
  console.log(`\n🔗 sourceUrl is set: ${withSourceUrl.length}`);
  console.log(`❌ autoUpdate=true but NO sourceUrl: ${withAutoButNoUrl.length}`);

  if (withAutoButNoUrl.length > 0) {
    console.log("\n⚠️  PROBLEM MARKETS (autoUpdate=true, but NO sourceUrl):");
    console.log("=".repeat(70));
    
    withAutoButNoUrl.forEach(market => {
      console.log(`\n📌 ${market.name} (ID: ${market.id})`);
      console.log(`   autoUpdate: ${market.autoUpdate}`);
      console.log(`   sourceUrl: ${market.sourceUrl || "❌ NOT SET"}`);
    });

    console.log("\n\n🔧 FIX: Need to set sourceUrl for these markets or modify scheduler\n");
  }

  console.log("\n" + "=".repeat(70));
  console.log("📋 All Markets Status:");
  console.log("=".repeat(70));

  markets.forEach(market => {
    const autoStatus = market.autoUpdate ? "✅" : "❌";
    const urlStatus = market.sourceUrl ? "✅" : "❌";
    const canUpdate = market.autoUpdate && market.sourceUrl ? "✅ YES" : "❌ NO";

    console.log(`\n${market.name} (ID: ${market.id})`);
    console.log(`  autoUpdate: ${autoStatus} | sourceUrl: ${urlStatus} | Will Auto-Update: ${canUpdate}`);
    if (market.sourceUrl) {
      console.log(`  URL: ${market.sourceUrl}`);
    }
  });
}

checkMarketAutoUpdate().catch(console.error);
