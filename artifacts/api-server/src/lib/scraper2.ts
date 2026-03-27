import axios from "axios";
import * as cheerio from "cheerio";
import { db, markets2Table } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * MAIN FUNCTION
 */
async function fetchAndUpdateMarkets2Result(marketId: number) {
  try {
    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      return { success: false, message: `Market2 ${marketId} not found`, data: null };
    }

    if (!market.sourceUrl) {
      return { success: false, message: `No sourceUrl for ${market.name}`, data: null };
    }

    console.log(`[Market2] Scraping: ${market.name}`);

    const result = await scrapeMarkets2Result(market.sourceUrl, market.name);

    console.log(`[Market2] Result: ${result}`);

    if (!result) {
      const errorMsg = `Market not found on website or results not ready yet`;
      await db.update(markets2Table)
        .set({
          fetchError: errorMsg,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return { success: false, message: errorMsg, data: null };
    }

    // Validate result is 2-digit number
    if (!/^\d{2}$/.test(result) || result === "XX") {
      const errorMsg = `Results not ready yet (showing as XX placeholder)`;
      await db.update(markets2Table)
        .set({
          fetchError: errorMsg,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return { success: false, message: errorMsg, data: null };
    }

    const updated = await db.update(markets2Table)
      .set({
        jodiResult: result,
        openResult: result.charAt(0),
        closeResult: result.charAt(1),
        fetchError: null,
        lastFetchedAt: new Date()
      })
      .where(eq(markets2Table.id, marketId))
      .returning();

    return {
      success: true,
      message: `Updated: ${result}`,
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
 * 🔥 FIXED SCRAPER - Aggressive Extraction
 */
async function scrapeMarkets2Result(url: string, marketName: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000 + Math.random() * 5000,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const $ = cheerio.load(response.data);

    // Try both selectors - table tr and table tbody tr
    let rows = $("table tbody tr");
    if (rows.length === 0) {
      rows = $("table tr");
    }

    console.log(`[Scraper] Found ${rows.length} rows`);

    if (rows.length === 0) {
      console.log(`[Scraper] No tables found`);
      return null;
    }

    const target = normalize(marketName);

    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      const cols = row.find("td");

      if (cols.length < 2) continue;

      const cellText = $(cols[0]).text().trim();
      const name = normalize(cellText);

      // Match market name
      if (name.includes(target) || target.includes(name)) {
        console.log(`✅ Found market: ${marketName}`);

        // Collect all values from columns
        const values: string[] = [];
        cols.each((idx, el) => {
          if (idx > 0) {
            const text = $(el).text().trim();
            values.push(text);
            console.log(`  [Col${idx}] "${text}"`);
          }
        });

        // Try each value to find valid result
        for (const val of values) {
          const cleaned = cleanResult(val);
          
          if (cleaned && isValidResult(cleaned)) {
            console.log(`✅ Returning: "${cleaned}" from "${val}"`);
            return cleaned;
          } else if (cleaned === "XX") {
            console.log(`⏳ Found XX placeholder`);
            return "XX";
          }
        }

        console.log(`⚠️ No valid result in any column for ${marketName}`);
        return null;
      }
    }

    console.log(`❌ Market "${marketName}" not found in table`);
    return null;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Scraper Error]", msg);
    return null;
  }
}

/**
 * ✅ NORMALIZE TEXT
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "").trim();
}

/**
 * ✅ CLEAN RESULT - AGGRESSIVE EXTRACTION
 * Tries multiple strategies to extract 2-digit result
 */
function cleanResult(val: string): string {
  if (!val) return "";

  const trimmed = val.trim().toUpperCase();

  // XX placeholder
  if (trimmed === "XX") return "XX";

  // Strategy 1: Match 2 consecutive digits
  let match = trimmed.match(/\d{2}/);
  if (match) return match[0];

  // Strategy 2: Match separated digits (4 5, 4-5, 4_5)
  match = trimmed.match(/(\d)\s*[-\s_]*(\d)/);
  if (match && match.length >= 3) {
    return match[1] + match[2];
  }

  // Strategy 3: Extract all digits, take first 2
  const allDigits = trimmed.replace(/\D/g, "");
  if (allDigits.length >= 2) return allDigits.substring(0, 2);
  if (allDigits.length === 1) return "0" + allDigits;

  return "";
}

/**
 * ✅ RESULT VALIDATION
 */
function isValidResult(val: string): boolean {
  return !!val && val !== "XX" && /^\d{2}$/.test(val);
}

/**
 * ✅ RANDOM USER AGENT
 */
function getRandomUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36"
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * TIME LOGIC
 */
function isAfterCloseWindow(closeTime: string): boolean {
  try {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    const [h, m] = closeTime.split(":").map(Number);
    const close = h * 60 + m;

    return current >= close + 20;
  } catch {
    return false;
  }
}

/**
 * MARKET ACTIVE STATUS
 */
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

      // Market is ACTIVE if currentTime is BEFORE betting close window
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
  isAfterCloseWindow,
  updateMarket2ActivityStatus
};