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
      const errorMsg = `Invalid result format: "${result}" - must be 2 digits (00-99) or XX`;
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
        "User-Agent": getRandomUserAgent()
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
          // Try different column combinations to find today's result
          const col1 = $(cols[1]).text().trim();
          const col2 = $(cols[2]).text().trim();
          
          console.log(`✅ [Scraper] FOUND ${marketName}`);
          console.log(`[Scraper] Col 1: "${col1}", Col 2: "${col2}"`);

          // 🎯 Priority: Try col2 first (usually today), then col1 (usually yesterday)
          // But validate that neither is "XX" (placeholder)
          
          // Try today's column first (col2)
          if (isValidResult(col2) && col2 !== "XX") {
            console.log(`✅ [Scraper] Using Col2 (Today): ${col2}`);
            return col2;
          }

          // If col2 is invalid, try col1
          if (isValidResult(col1) && col1 !== "XX") {
            console.log(`⚠️ [Scraper] Col2 not ready, using Col1 (Yesterday): ${col1}`);
            return col1;
          }

          // If both are XX or invalid, return XX to indicate not ready
          if (col2 === "XX" || col1 === "XX") {
            console.log(`⏳ [Scraper] Results not ready yet (XX placeholder)`);
            return "XX";
          }

          // Both are invalid/empty
          console.log(`❌ [Scraper] No valid results found in columns`);
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
 * ✅ RESULT VALIDATION
 * Accepts 2-digit numbers (00-99) and "XX" as temporary placeholder
 */
function isValidResult(val: string): boolean {
  if (!val) return false;
  // Accept both valid 2-digit numbers AND "XX" as placeholder
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
      const [closeH, closeM] = market.closeTime.split(":").map(Number);
      const closeTimeInMinutes = closeH * 60 + closeM;

      // Betting closes 10 minutes before market closes
      const bettingCloseTime = closeTimeInMinutes - 10;

      // Market is ACTIVE (betting allowed) only BEFORE betting close window
      const shouldBeActive = currentTime < bettingCloseTime;

      if (market.isActive !== shouldBeActive) {
        await db.update(markets2Table)
          .set({ isActive: shouldBeActive })
          .where(eq(markets2Table.id, market.id));

        console.log(`[Activity] ${market.name}: isActive = ${shouldBeActive}`);
      }
    }
  } catch (err) {
    console.error("[Activity Error]", err);
  }
}

export {
  fetchAndUpdateMarkets2Result,
  scrapeMarkets2Result,
  isAfterCloseTime,
  updateMarket2ActivityStatus
};