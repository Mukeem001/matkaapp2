import axios from "axios";

async function searchPageForNumbers() {
  try {
    const response = await axios.get("https://akingsatta.in/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" },
      timeout: 30000,
    });
    
    const text = response.data;
    const lines = text.split("\n");
    
    console.log("\nSearching for '57':");
    lines.forEach((line, idx) => {
      if (line.includes("57")) {
        console.log(`  Line ${idx}: ${line.substring(0, 150)}`);
      }
    });
    
    console.log("\nSearching for '47':");
    lines.forEach((line, idx) => {
      if (line.includes("47")) {
        console.log(`  Line ${idx}: ${line.substring(0, 150)}`);
      }
    });
    
    console.log("\nSearching for 'SINGAPUR' context (raw lines):");
    const singaporIdx = lines.findIndex(l => l.includes("SINGAPUR"));
    if (singaporIdx >= 0) {
      for (let i = Math.max(0, singaporIdx - 3); i < Math.min(lines.length, singaporIdx + 10); i++) {
        console.log(`[${i}] ${lines[i]}`);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
  
  process.exit(0);
}

searchPageForNumbers();
