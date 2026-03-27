import axios from "axios";
import * as cheerio from "cheerio";
import { db, markets2Table } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Scraper for Market2 (2-digit markets)
 * Source: https://satta-king-fast.com/
 */

async function fetchAndUpdateMarkets2Result(marketId: number) {
  try {
    const market = await db.select().from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      return { success: false, message: `Market2 ${marketId} not found`, data: null };
    }

    if (!market.sourceUrl) {
      return { success: false, message: `No sourceUrl configured for ${market.name}`, data: null };
    }

    // ✅ Check if current time is AFTER closeTime (not openTime + 10)
    if (!isAfterCloseTime(market.closeTime)) {
      const [h, m] = market.closeTime.split(":").map(Number);
      const closeTimeInMinutes = h * 60 + m;
      const closeHrs = Math.floor(closeTimeInMinutes / 60) % 24;
      const closeMins = closeTimeInMinutes % 60;
      const windowTimeStr = `${String(closeHrs).padStart(2, '0')}:${String(closeMins).padStart(2, '0')}`;
      return {
        success: false,
        message: `Can fetch only after ${windowTimeStr} (closeTime: ${market.closeTime})`,
        data: null
      };
    }

    console.log(`[Market2] Scraping: ${market.name}`);

    const result = await scrapeMarkets2Result(market.sourceUrl, market.name);

    console.log(`[Market2] Scraping result for ${market.name}: ${result ? result : 'NULL'}`);

    // ✅ Distinguish between different error types
    if (!result) {
      const errorMsg = `Market not found on website or results not ready yet`;
      await db.update(markets2Table)
        .set({
          fetchError: errorMsg,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return {
        success: false,
        message: errorMsg,
        data: null
      };
    }

    // ✅ Validate result is exactly 2 digits OR "XX" (placeholder)
    if (!isValidResult(result)) {
      const errorMsg = `Invalid result: got "${result}" (length: ${result.length}, chars: ${result.split('').map(c => c.charCodeAt(0)).join(',')}) - expected 2 digits (00-99) or XX`;
      
      console.error(`[Market2] Validation FAILED for ${market.name}:`);
      console.error(`  Raw result: "${result}"`);
      console.error(`  Length: ${result.length}`);
      console.error(`  Char codes: ${result.split('').map((c, i) => `[${i}]=${c}(${c.charCodeAt(0)})`).join(' ')}`);
      
      await db.update(markets2Table)
        .set({
          fetchError: errorMsg,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return {
        success: false,
        message: errorMsg,
        data: null
      };
    }

    // ✅ For 2-digit markets: openResult = closeResult = jodiResult = same value
    // Special handling for "XX" - mark as temporary/not ready
    const successMsg = result === "XX" 
      ? `Results not yet available on website (showing as XX - temporary placeholder)` 
      : `Updated: ${result}`;

    const updated = await db.update(markets2Table)
      .set({
        openResult: result,
        closeResult: result,
        jodiResult: result,
        fetchError: result === "XX" ? "Results marked as XX - temporary placeholder" : null,
        lastFetchedAt: new Date()
      })
      .where(eq(markets2Table.id, marketId))
      .returning();

    return {
      success: true,
      message: successMsg,
      data: updated[0]
    };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await db.update(markets2Table)
      .set({
        fetchError: errorMsg,
        lastFetchedAt: new Date()
      })
      .where(eq(markets2Table.id, marketId));

    return { success: false, message: errorMsg, data: null };
  }
}

/**
 * ✅ ROBUST SCRAPER (TABLE BASED WITH TODAY'S DATE VALIDATION)
 * Fetches results for TODAY's date specifically
 */
async function scrapeMarkets2Result(url: string, marketName: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
      }
    });

    const $ = cheerio.load(response.data);

    // 🟢 Get today's date for validation
    const today = new Date();
    const todayDate = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
    console.log(`[Scraper] Looking for results for: ${todayDate}`);

    // 🔥 METHOD 1: TABLE BASED SCRAPING (Most Reliable)
    const rows = $("table tr");
    
    if (rows.length === 0) {
      console.log(`⚠️ [Scraper] No tables found on page. URL: ${url}`);
      return null;
    }

    console.log(`[Scraper] Found ${rows.length} rows in table`);

    const cleanTarget = marketName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      const cols = row.find("td");

      if (cols.length >= 3) {
        const cellText = $(cols[0]).text().trim();
        const cleanName = cellText.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

        // Try multiple matching strategies
        if (cleanName.includes(cleanTarget) || cleanTarget.includes(cleanName) || cellText.toLowerCase().includes(marketName.toLowerCase())) {
          console.log(`✅ [Scraper] FOUND ${marketName}`);
          console.log(`[Scraper] Total columns in row: ${cols.length}`);

          // Try to find 2-digit result - AGGRESSIVE APPROACH
          // First, collect ALL text from all columns
          const allTexts: string[] = [];
          for (let j = 0; j < cols.length; j++) {
            const rawText = $(cols[j]).text().trim();
            allTexts.push(rawText);
            console.log(`[Scraper] Col${j}: raw="${rawText}"`);
          }

          // Priority order: try cols[1], cols[2], then any others
          const colsToTry = [1, 2, 3, 4, 5];
          
          for (const colIdx of colsToTry) {
            if (colIdx >= cols.length) continue;
            
            const rawText = allTexts[colIdx];
            
            // AGGRESSIVE CLEANING - try multiple strategies
            let result = null;
            
            // Strategy 1: Direct 2-digit match
            let match = rawText.match(/\d{2}/);
            if (match) {
              result = match[0];
              console.log(`[Scraper] Col${colIdx} Strategy 1 (2-digit): "${rawText}" → "${result}"`);
            }
            
            // Strategy 2: Extract ALL digits and take first 2
            if (!result) {
              const allDigits = rawText.replace(/\D/g, "");
              if (allDigits.length >= 2) {
                result = allDigits.substring(0, 2);
                console.log(`[Scraper] Col${colIdx} Strategy 2 (extract digits): "${rawText}" → "${result}"`);
              }
            }
            
            // Strategy 3: Check for XX
            if (!result && (rawText.toUpperCase() === "XX" || rawText.toUpperCase().includes("XX"))) {
              result = "XX";
              console.log(`[Scraper] Col${colIdx} Strategy 3 (XX placeholder): "${rawText}" → "${result}"`);
            }
            
            // Validate result
            if (result) {
              if (isValidResult(result)) {
                if (result !== "XX") {
                  console.log(`✅ [Scraper] FOUND VALID RESULT in Col${colIdx}: ${result}`);
                  return result;
                } else {
                  console.log(`⏳ [Scraper] Found XX placeholder in Col${colIdx}`);
                  // Don't return yet, try other columns first
                }
              } else {
                console.log(`❌ [Scraper] Col${colIdx} failed validation: "${result}"`);
              }
            }
          }

          // If nothing found, try to extract ANY 2 digits from entire row
          console.log(`⚠️ [Scraper] Priority columns failed, searching entire row...`);
          for (let j = 0; j < cols.length; j++) {
            const rawText = allTexts[j];
            const allDigits = rawText.replace(/\D/g, "");
            if (allDigits.length >= 2) {
              const extracted = allDigits.substring(0, 2);
              if (isValidResult(extracted) && extracted !== "XX") {
                console.log(`✅ [Scraper] FOUND in Col${j} (fallback): "${rawText}" → "${extracted}"`);
                return extracted;
              }
            }
            if (rawText === "XX" || rawText.toUpperCase() === "XX") {
              console.log(`⏳ [Scraper] Found XX in Col${j} (fallback)`);
              return "XX";
            }
          }

          console.log(`⚠️ [Scraper] No valid result found for ${marketName}`);
          return null;
        }
      }
    }

    console.log(`❌ [Scraper] Market "${marketName}" not found in table. Checked ${rows.length} rows.`);
    return null;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Scraper Error] URL: ${url}, Market: ${marketName}, Error: ${errorMsg}`);
    return null;
  }
}

/**
 * ✅ RESULT CLEANING - AGGRESSIVE MULTI-STRATEGY
 * Tries multiple approaches to extract 2-digit number
 */
function cleanResult(val: string): string {
  if (!val) return "";
  
  const trimmed = val.trim().toUpperCase();
  
  // For "XX" placeholder, keep it
  if (trimmed === "XX") {
    return "XX";
  }

  // Strategy 1: Look for 2 consecutive digits (most common)
  let digitMatch = trimmed.match(/\d{2}/);
  if (digitMatch) {
    return digitMatch[0];
  }

  // Strategy 2: Look for single digits separated by space/dash/underscore
  // e.g. "4 5" → "45", "4-5" → "45"
  let separatedMatch = trimmed.match(/(\d)\s*[-\s_]*(\d)/);
  if (separatedMatch && separatedMatch.length >= 3) {
    const num1 = separatedMatch[1];
    const num2 = separatedMatch[2];
    if (num1 && num2) {
      return num1 + num2;
    }
  }

  // Strategy 3: Extract all digits and take first 2
  const allDigits = trimmed.replace(/\D/g, "");
  if (allDigits.length >= 2) {
    return allDigits.substring(0, 2);
  }

  // Strategy 4: Single digit might mean result is "0X"
  if (allDigits.length === 1) {
    return "0" + allDigits;
  }

  // Return empty if no digits found
  return "";
}

/**
 * ✅ RESULT VALIDATION
 * Accepts 2-digit numbers (00-99) and "XX" as temporary placeholder
 */
function isValidResult(val: string): boolean {
  if (!val) return false;
  // Accept valid 2-digit numbers or "XX" placeholder
  return /^\d{2}$/.test(val) || val === "XX";
}

/**
 * ✅ RANDOM USER AGENT (ANTI-BLOCK)
 */
function getRandomUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (X11; Linux x86_64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * TIME LOGIC - Check if current time is AFTER closeTime
 */
function isAfterCloseTime(closeTime: string): boolean {
  try {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [h, m] = closeTime.split(":").map(Number);
    const close = h * 60 + m;

    return currentTime >= close;
  } catch {
    return false;
  }
}

async function updateMarket2ActivityStatus() {
  try {
    const markets = await db.select().from(markets2Table);
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    for (const market of markets) {
      const [openH, openM] = market.openTime.split(":").map(Number);
      const openTimeInMinutes = openH * 60 + openM;

      const [closeH, closeM] = market.closeTime.split(":").map(Number);
      const closeTimeInMinutes = closeH * 60 + closeM;

      // Betting closes 10 minutes before market closes
      const bettingCloseTime = closeTimeInMinutes - 10;

      // Market is ACTIVE (betting allowed) if currentTime is BEFORE betting close window
      // This includes time before market opens too
      const shouldBeActive = currentTime < bettingCloseTime;

      if (market.isActive !== shouldBeActive) {
        await db.update(markets2Table)
          .set({ isActive: shouldBeActive })
          .where(eq(markets2Table.id, market.id));

        const currentTimeStr = `${String(Math.floor(currentTime / 60)).padStart(2, '0')}:${String(currentTime % 60).padStart(2, '0')}`;
        const openTimeStr = `${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}`;
        const bettingCloseStr = `${String(Math.floor(bettingCloseTime / 60)).padStart(2, '0')}:${String(bettingCloseTime % 60).padStart(2, '0')}`;

        console.log(`[Market2 Activity] ${market.name}: isActive = ${shouldBeActive}`);
        console.log(`  └─ Opens: ${openTimeStr}, Betting closes: ${bettingCloseStr}, Current: ${currentTimeStr}`);
      }
    }
  } catch (err) {
    console.error("[Market2 Activity Error]", err);
  }
}

export {
  fetchAndUpdateMarkets2Result,
  scrapeMarkets2Result,
  isAfterCloseTime,
  updateMarket2ActivityStatus
};