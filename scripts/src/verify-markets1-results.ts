import "dotenv/config";
import { db, marketsTable, resultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { scrapeSattaMatkaComIn } from "../../src/lib/scraper";
import { getTodayDateIST } from "../../src/lib/date-utils";

interface VerificationReport {
  marketName: string;
  marketId: number;
  websiteResult: {
    openResult?: string;
    jodiResult?: string;
    closeResult?: string;
  };
  databaseResult: {
    openResult?: string;
    jodiResult?: string;
    closeResult?: string;
  };
  matches: boolean;
  differences: string[];
}

async function verifyMarkets1Results() {
  console.log("🔍 Verifying Markets1 Results for Today");
  console.log("==========================================\n");

  const todayDate = getTodayDateIST();
  console.log(`Today's Date (IST): ${todayDate}\n`);

  // Get all active markets
  const markets = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.isActive, true));

  console.log(`Found ${markets.length} active markets\n`);

  const reports: VerificationReport[] = [];

  for (const market of markets) {
    console.log(`\n📊 Checking: ${market.name} (ID: ${market.id})`);
    console.log("-".repeat(50));

    // Fetch from website
    console.log("  ⬇️  Fetching from website...");
    let websiteResult = { openResult: "", jodiResult: "", closeResult: "" };
    
    try {
      websiteResult = await scrapeSattaMatkaComIn(market.name);
      console.log(`  ✅ Website Result:`, websiteResult);
    } catch (err) {
      console.log(`  ❌ Website Error:`, err instanceof Error ? err.message : String(err));
    }

    // Fetch from database
    console.log("  📦 Fetching from database...");
    const [dbResult] = await db
      .select()
      .from(resultsTable)
      .where(
        and(
          eq(resultsTable.marketId, market.id),
          eq(resultsTable.resultDate, todayDate)
        )
      );

    const databaseResult = dbResult ? {
      openResult: dbResult.openResult || "",
      jodiResult: dbResult.jodiResult || "",
      closeResult: dbResult.closeResult || "",
    } : {
      openResult: "❌ NOT SAVED",
      jodiResult: "❌ NOT SAVED",
      closeResult: "❌ NOT SAVED",
    };

    console.log(`  📦 Database Result:`, databaseResult);

    // Compare
    const differences: string[] = [];
    
    if (websiteResult.openResult !== databaseResult.openResult) {
      differences.push(`Open: "${websiteResult.openResult}" vs "${databaseResult.openResult}"`);
    }
    if (websiteResult.jodiResult !== databaseResult.jodiResult) {
      differences.push(`Jodi: "${websiteResult.jodiResult}" vs "${databaseResult.jodiResult}"`);
    }
    if (websiteResult.closeResult !== databaseResult.closeResult) {
      differences.push(`Close: "${websiteResult.closeResult}" vs "${databaseResult.closeResult}"`);
    }

    const matches = differences.length === 0;

    const report: VerificationReport = {
      marketName: market.name,
      marketId: market.id,
      websiteResult,
      databaseResult,
      matches,
      differences,
    };

    reports.push(report);

    if (matches) {
      console.log(`  ✅ MATCHES - Results are correct!`);
    } else {
      console.log(`  ❌ MISMATCH - Differences found:`);
      differences.forEach(diff => console.log(`     • ${diff}`));
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("📋 VERIFICATION SUMMARY");
  console.log("=".repeat(60));

  const matchingCount = reports.filter(r => r.matches).length;
  const mismatchCount = reports.filter(r => !r.matches).length;
  const noResultCount = reports.filter(r => !r.databaseResult.closeResult || r.databaseResult.closeResult === "❌ NOT SAVED").length;

  console.log(`\n✅ Matching: ${matchingCount}/${reports.length}`);
  console.log(`❌ Mismatches: ${mismatchCount}/${reports.length}`);
  console.log(`⚠️  No Results Saved: ${noResultCount}/${reports.length}`);

  // Show details of mismatches
  if (mismatchCount > 0) {
    console.log("\n\n" + "=".repeat(60));
    console.log("🔴 MISMATCHED MARKETS");
    console.log("=".repeat(60));

    reports.filter(r => !r.matches).forEach(report => {
      console.log(`\n${report.marketName} (ID: ${report.marketId})`);
      report.differences.forEach(diff => console.log(`  • ${diff}`));
    });
  }

  // Show no results
  const noResultMarkets = reports.filter(r => !r.databaseResult.closeResult || r.databaseResult.closeResult === "❌ NOT SAVED");
  if (noResultMarkets.length > 0) {
    console.log("\n\n" + "=".repeat(60));
    console.log("⚠️  MARKETS WITH NO RESULTS SAVED");
    console.log("=".repeat(60));

    noResultMarkets.forEach(report => {
      console.log(`\n${report.marketName} (ID: ${report.marketId})`);
      console.log(`  Website: ${report.websiteResult.closeResult ? "✅ Found" : "❌ Not Found"}`);
      console.log(`  Database: ❌ Not Saved for ${todayDate}`);
    });
  }

  console.log("\n\nDone! ✅\n");
}

verifyMarkets1Results().catch(console.error);
