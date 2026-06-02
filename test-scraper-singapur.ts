import { scrapeLiveResults } from "./src/lib/scraper.js";

async function testSingapur() {
  console.log("\n=== TESTING SINGAPUR NIGHT SCRAPER ===\n");
  
  // Test with different variations of market name
  const testNames = [
    "SINGAPUR NIGHT",
    "SINGAPUR",
    "Singapur Night",
  ];
  
  for (const marketName of testNames) {
    console.log(`\n📌 Testing with market name: "${marketName}"`);
    console.log("─".repeat(60));
    
    try {
      const result = await scrapeLiveResults(marketName);
      console.log("Result:", result);
      console.log("\nFormatted:");
      console.log(`  Open: ${result.openResult}`);
      console.log(`  Jodi: ${result.jodiResult}`);
      console.log(`  Close: ${result.closeResult}`);
    } catch (err) {
      console.error("Error:", err);
    }
    
    console.log("─".repeat(60));
  }
  
  process.exit(0);
}

testSingapur();
