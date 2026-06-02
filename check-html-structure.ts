import * as cheerio from "cheerio";
import axios from "axios";

async function checkHTML() {
  console.log("\n=== CHECKING HTML AROUND SINGAPUR ===\n");
  
  try {
    const response = await axios.get("https://akingsatta.in/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      },
      timeout: 30000,
    });
    
    const $ = cheerio.load(response.data);
    
    // Find element containing SINGAPUR NIGHT
    const elem = $("*:contains('SINGAPUR NIGHT')").first();
    
    if (elem.length > 0) {
      console.log("Found SINGAPUR NIGHT element");
      
      // Get parent container and show context
      let parent = elem.parent();
      for (let i = 0; i < 3; i++) {
        if (parent.length > 0) parent = parent.parent();
      }
      
      console.log("\n--- HTML SNIPPET (first 2000 chars) ---");
      const html = parent.html() || "";
      console.log(html.substring(0, 2000));
    } else {
      console.log("SINGAPUR NIGHT not found");
    }
    
  } catch (err) {
    console.error("Error:", err);
  }
  
  process.exit(0);
}

checkHTML();
