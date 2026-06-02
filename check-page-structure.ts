import * as cheerio from "cheerio";
import axios from "axios";

async function checkPageStructure() {
  console.log("\n=== CHECKING AKINGSATTA PAGE STRUCTURE ===\n");
  
  try {
    const response = await axios.get("https://akingsatta.in/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      },
      timeout: 30000,
    });
    
    const $ = cheerio.load(response.data);
    const text = $("body").text();
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    
    console.log(`Total lines: ${lines.length}\n`);
    
    // Find SINGAPUR NIGHT
    const singaporIdx = lines.findIndex(l => l === "SINGAPUR NIGHT");
    console.log(`SINGAPUR NIGHT found at line: ${singaporIdx}`);
    
    if (singaporIdx >= 0) {
      console.log("\n--- LINES AROUND SINGAPUR NIGHT ---");
      for (let i = Math.max(0, singaporIdx - 2); i < Math.min(lines.length, singaporIdx + 15); i++) {
        const marker = i === singaporIdx ? ">>> " : "    ";
        console.log(`[${String(i).padStart(3, '0')}] ${marker}"${lines[i]}"`);
      }
    }
    
    // Also check for SINGAPUR without NIGHT
    const singaporOnlyIdx = lines.findIndex((l, idx) => l === "SINGAPUR" && idx > singaporIdx);
    console.log(`\nSINGAPUR (alone) found at line: ${singaporOnlyIdx}`);
    
    if (singaporOnlyIdx >= 0) {
      console.log("\n--- LINES AROUND SINGAPUR (alone) ---");
      for (let i = Math.max(0, singaporOnlyIdx - 2); i < Math.min(lines.length, singaporOnlyIdx + 15); i++) {
        const marker = i === singaporOnlyIdx ? ">>> " : "    ";
        console.log(`[${String(i).padStart(3, '0')}] ${marker}"${lines[i]}"`);
      }
    }
    
  } catch (err) {
    console.error("Error:", err);
  }
  
  process.exit(0);
}

checkPageStructure();
