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

    // ✅ Check if current time is after openTime + 10 minutes
    if (!isAfterOpenWindow(market.openTime)) {
      const [h, m] = market.openTime.split(":").map(Number);
      const openWindow = (h * 60 + m) + 10;
      const openHrs = Math.floor(openWindow / 60) % 24;
      const openMins = openWindow % 60;
      const windowTimeStr = `${String(openHrs).padStart(2, '0')}:${String(openMins).padStart(2, '0')}`;
      return {
        success: false,
        message: `Can fetch only after ${windowTimeStr} (openTime: ${market.openTime} + 10 min)`,
        data: null
      };
    }

    console.log(`[Market2] Scraping: ${market.name}`);

    const result = await scrapeMarkets2Result(market.sourceUrl, market.name);

    console.log(`[Market2] Result for ${market.name}: ${result}`);

    if (!result || result.length !== 2) {
      await db.update(markets2Table)
        .set({
          fetchError: `Invalid result: "${result}"`,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return {
        success: false,
        message: `Invalid result format`,
        data: null
      };
    }

    const updated = await db.update(markets2Table)
      .set({
        openResult: result[0],
        closeResult: result[1],
        jodiResult: result,
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
 * ✅ FIXED SCRAPER (TABLE BASED - ACCURATE)
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

    // 🔥 MAIN FIX: TABLE BASED SCRAPING
    const rows = $("table tr");

    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      const cols = row.find("td");

      if (cols.length >= 3) {
        const name = $(cols[0]).text().trim().toLowerCase().replace(/\s+/g, "");
        const target = marketName.toLowerCase().replace(/\s+/g, "");

        if (name.includes(target)) {
          const prev = $(cols[1]).text().trim();   // Sun
          const today = $(cols[2]).text().trim();  // Mon

          console.log(`🟢 Found ${marketName}: Prev=${prev}, Today=${today}`);

          // Priority → Today
          if (isValidResult(today)) return today;

          // Fallback → Previous
          if (isValidResult(prev)) return prev;
        }
      }
    }

    console.log(`🔴 No result found for ${marketName}`);
    return null;

  } catch (err) {
    console.error("[Scraper Error]", err);
    return null;
  }
}

/**
 * ✅ RESULT VALIDATION
 */
function isValidResult(val: string): boolean {
  return !!val && val !== "XX" && /^\d{2}$/.test(val);
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
 * TIME LOGIC (UNCHANGED)
 */
function isAfterOpenWindow(openTime: string): boolean {
  try {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [h, m] = openTime.split(":").map(Number);
    const open = h * 60 + m;

    return currentTime >= open + 10;
  } catch {
    return false;
  }
}

async function updateMarket2ActivityStatus() {
  try {
    const markets = await db.select().from(markets2Table);
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    for (const market of markets) {
      const [h, m] = market.openTime.split(":").map(Number);
      const open = h * 60 + m;

      const shouldBeActive = current < open + 10;

      if (market.isActive !== shouldBeActive) {
        await db.update(markets2Table)
          .set({ isActive: shouldBeActive })
          .where(eq(markets2Table.id, market.id));

        console.log(`[Activity] ${market.name}: ${shouldBeActive}`);
      }
    }
  } catch (err) {
    console.error("[Activity Error]", err);
  }
}

export {
  fetchAndUpdateMarkets2Result,
  scrapeMarkets2Result,
  isAfterOpenWindow,
  updateMarket2ActivityStatus
};