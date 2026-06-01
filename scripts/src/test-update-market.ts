import "dotenv/config";
import { fetchAndUpdateMarketResult } from "../../src/lib/scraper";

async function testUpdateSingleMarket() {
  console.log("🧪 Testing fetchAndUpdateMarketResult for market ID 86 (WORLI MUMBAI)\n");

  try {
    const result = await fetchAndUpdateMarketResult(86);
    console.log("\n✅ Update Result:", result);
  } catch (err) {
    console.error("\n❌ Error:", err instanceof Error ? err.message : String(err));
  }
}

testUpdateSingleMarket().catch(console.error);
