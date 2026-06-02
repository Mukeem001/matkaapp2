import { scrapeLiveResults } from "./src/lib/scraper.js";

async function testSingapur() {
  try {
    console.log("\n🔍 Testing SINGAPUR NIGHT scraper...");
    
    const result = await scrapeLiveResults("SINGAPUR NIGHT");
    
    console.log("\n📊 Scraper result:");
    console.log(JSON.stringify(result, null, 2));
    
    console.log("\n📝 Open:", result.openResult);
    console.log("📝 Jodi:", result.jodiResult);
    console.log("📝 Close:", result.closeResult);
    
  } catch (err) {
    console.error("Error:", err);
  }
  
  process.exit(0);
}

testSingapur();
