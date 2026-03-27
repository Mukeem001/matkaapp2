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
      await db.update(markets2Table)
        .set({
          fetchError: `Invalid result`,
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId));

      return { success: false, message: "Invalid result", data: null };
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
 * 🔥 FIXED SCRAPER (LATEST COLUMN LOGIC)
 */
async function scrapeMarkets2Result(url: string, marketName: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000 + Math.random() * 5000,
      headers: {
        "User-Agent": getRandomUserAgent()
      }
    });

    const $ = cheerio.load(response.data);

    const rows = $("table tbody tr");

    const target = normalize(marketName);

    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      const cols = row.find("td");

      if (cols.length < 2) continue;

      const name = normalize($(cols[0]).text());

      // ✅ better matching
      if (name.includes(target)) {

        const values: string[] = [];

        cols.each((i, el) => {
          if (i > 0) {
            values.push($(el).text().trim());
          }
        });

        // 🔥 latest valid result
        const latest = values.reverse().find(v => isValidResult(v));

        console.log(`🟢 ${marketName} → Values:`, values);
        console.log(`✅ Latest: ${latest}`);

        if (latest) return latest;
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
 * ✅ NORMALIZE TEXT
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "").trim();
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
    const current = now.getHours() * 60 + now.getMinutes();

    for (const market of markets) {
      const [h, m] = market.closeTime.split(":").map(Number);
      const close = h * 60 + m;

      const shouldBeActive = current < close;

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
  isAfterCloseWindow,
  updateMarket2ActivityStatus
};