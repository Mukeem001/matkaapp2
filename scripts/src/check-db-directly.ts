import "dotenv/config";
import { db, resultsTable, marketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTodayDateIST } from "../../src/lib/date-utils";

async function checkDatabaseDirectly() {
  console.log("🔍 Direct Database Check\n");

  const todayDate = getTodayDateIST();
  console.log(`Today's Date (IST): ${todayDate}\n`);

  // Check WORLI MUMBAI (ID 86)
  console.log("Checking WORLI MUMBAI (ID: 86)");
  console.log("-".repeat(50));

  const results = await db
    .select()
    .from(resultsTable)
    .where(eq(resultsTable.marketId, 86));

  console.log(`Total results for WORLI MUMBAI: ${results.length}`);

  if (results.length > 0) {
    results.forEach(r => {
      console.log(`\n  resultDate: ${r.resultDate}`);
      console.log(`  open: ${r.openResult}`);
      console.log(`  jodi: ${r.jodiResult}`);
      console.log(`  close: ${r.closeResult}`);
    });
  }

  // Check for today specifically
  const todayResult = results.filter(r => r.resultDate === todayDate);
  console.log(`\nResults for TODAY (${todayDate}): ${todayResult.length}`);

  if (todayResult.length > 0) {
    todayResult.forEach(r => {
      console.log(`✅ FOUND: ${r.openResult}-${r.jodiResult}-${r.closeResult}`);
    });
  } else {
    console.log("❌ NO RESULTS FOR TODAY");
  }
}

checkDatabaseDirectly().catch(console.error);
