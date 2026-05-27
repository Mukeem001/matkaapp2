import axios from "axios";
import * as cheerio from "cheerio";
import { eq, and } from "drizzle-orm";
import { format } from "date-fns";
import { db, marketsTable, scraperLogsTable, resultsTable } from "@workspace/db";
import { getTodayDateIST } from "./date-utils";

// Proxy helper: use SCRAPER_API_KEY to route through a scraping provider when set
async function fetchUrl(url: string) {
  const apiKey = process.env.SCRAPER_API_KEY;
  const provider = (process.env.SCRAPER_PROVIDER || "scraperapi").toLowerCase();

  let finalUrl = url;
  if (apiKey) {
    if (provider === "scraperapi") {
      finalUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=true`;
    } else if (provider === "scrapingbee") {
      finalUrl = `https://app.scrapingbee.com/api/v1?api_key=${apiKey}&url=${encodeURIComponent(url)}&render_js=true`;
    }
    console.log(`[Scraper] Using proxy provider=${provider} for ${url}`);
  } else {
    console.log(`[Scraper] No proxy configured, fetching ${url} directly`);
  }

  return axios.get(finalUrl, {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
}

export interface ScrapedResult {
  openResult?: string;
  closeResult?: string;
  jodiResult?: string;
}

// ================= HELPER FUNCTIONS =================
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Check if current time is after openTime + 10 minutes
function isAfterOpenWindow(openTime: string): boolean {
  const { hours: openHour, minutes: openMin } = parseTimeString(openTime);
  const openTimeInMinutes = timeToMinutes(openHour, openMin);
  const openWindowEndMinutes = openTimeInMinutes + 10; // 10 min after open
  const currentTimeInMinutes = getCurrentTimeInMinutes();
  
  return currentTimeInMinutes >= openWindowEndMinutes;
}

// Check if current time is after closeTime + 20 minutes (DEPRECATED - kept for backward compatibility)
function isAfterCloseWindow(closeTime: string): boolean {
  const { hours: closeHour, minutes: closeMin } = parseTimeString(closeTime);
  const closeTimeInMinutes = timeToMinutes(closeHour, closeMin);
  const closeWindowEndMinutes = closeTimeInMinutes + 20; // 20 min after close
  const currentTimeInMinutes = getCurrentTimeInMinutes();
  
  return currentTimeInMinutes >= closeWindowEndMinutes;
}

// ================= SCRAPER =================
const SATTA_KING_FAST_URL = "https://satta-king-fast.com/";

function normalizeScrapeLine(input: string): string {
  return input
    .replace(/\u00A0/g, " ")
    .replace(/[^A-Z0-9 ]+/gi, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseTwoDigitResult(line: string): ScrapedResult | undefined {
  const cleaned = normalizeScrapeLine(line);
  if (/\bXX\b/.test(cleaned)) {
    return { openResult: "XX", jodiResult: "XX", closeResult: "XX" };
  }
  const match = cleaned.match(/\b(\d{2})\b/);
  if (!match) {
    return undefined;
  }
  const value = match[1];
  return {
    openResult: value[0],
    jodiResult: value,
    closeResult: value[1],
  };
}

function findSattaKingFastMarketResult(
  $: cheerio.CheerioAPI,
  marketName: string
): ScrapedResult {
  const cleanMarket = normalizeScrapeLine(marketName);

  const rows = $("tr.game-result").toArray();
  for (const row of rows) {
    const $row = $(row);
    const marketText = $row.find("h3.game-name").first().text().trim();
    if (!marketText) continue;

    const cleanRowMarket = normalizeScrapeLine(marketText);
    const marketFound =
      cleanRowMarket === cleanMarket ||
      cleanRowMarket.includes(cleanMarket) ||
      cleanMarket.includes(cleanRowMarket);

    if (!marketFound) continue;

    const todayValue =
      $row.find("td.today-number h3").first().text().trim() ||
      $row.find("td.today-number").first().text().trim();

    if (todayValue) {
      const candidate = parseTwoDigitResult(todayValue);
      if (candidate) return candidate;
    }
  }

  return {};
}

function findMarketResult(lines: string[], marketName: string): ScrapedResult {
  const cleanMarket = normalizeScrapeLine(marketName);

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeScrapeLine(lines[i]);
    if (!line) continue;

    const marketFound =
      line === cleanMarket ||
      line.includes(cleanMarket) ||
      line.startsWith(`${cleanMarket} `) ||
      line.endsWith(` ${cleanMarket}`);

    if (!marketFound) continue;

    for (let j = i; j < i + 6 && j < lines.length; j++) {
      const result = parseTwoDigitResult(lines[j]);
      if (result) return result;
    }
  }

  return {};
}

async function scrapeSattaKingFast(
  marketName: string
): Promise<ScrapedResult> {
  const response = await fetchUrl(SATTA_KING_FAST_URL);

  const $ = cheerio.load(response.data);
  const directResult = findSattaKingFastMarketResult($, marketName);
  if (directResult.closeResult) {
    return directResult;
  }

  const text = $("body").text();
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return findMarketResult(lines, marketName);
}

export async function scrapeResult(
  url: string,
  marketName?: string
): Promise<ScrapedResult> {

  // 👉 sirf satta-king-fast handle
  if (
    (url.includes("satta-king-fast.com") || url.includes("satkamatka.com.in")) &&
    marketName
  ) {
    return await scrapeSattaKingFast(marketName);
  }


  const response = await fetchUrl(url);

  const $ = cheerio.load(response.data);
  const text = $("body").text();

  const match = text.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);

  if (match) {
    return {
      openResult: match[1],
      jodiResult: match[2],
      closeResult: match[3],
    };
  }

  return {};
}

// ================= SATKAMATKA (FIRST PAGE ONLY) =================
async function scrapeSattaMatkaComIn(
  marketName: string
): Promise<ScrapedResult> {

  const response = await fetchUrl("https://satkamatka.com.in/");

  const $ = cheerio.load(response.data);
  const text = $("body").text();

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);  // Keep all lines

  console.log("\n========== 🔍 SCRAPING SATKAMATKA ==========");
  console.log("Market to find:", `"${marketName}"`);
  console.log("Total lines:", lines.length);

  const cleanMarket = marketName.toUpperCase().replace(/\s+/g, " ").trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.toUpperCase().replace(/\s+/g, " ").trim();

    // ✅ EXACT MATCH ONLY
    if (cleanLine === cleanMarket) {
      console.log(`🎯 MARKET FOUND at line ${i}:`, `"${line}"`);

      // Search in next 5 lines for results (try multiple regex patterns)
      for (let j = i; j < i + 5 && j < lines.length; j++) {
        const checkLine = lines[j];
        console.log(`  👉 Checking [${j}]:`, `"${checkLine}"`);

        // Try pattern 1: XXX-XX-XXX (e.g., 156-25-267)
        let match = checkLine.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);
        if (match) {
          console.log(`✅ FOUND PATTERN 1 (XXX-XX-XXX):`, match[0]);
          return {
            openResult: match[1],
            jodiResult: match[2],
            closeResult: match[3],
          };
        }

        // Try pattern 2: XXX-X (e.g., 567-8) - treat as open-jodi, close will be from next occurrence
        match = checkLine.match(/(\d{1,3})-(\d{1,3})(?!-)/);
        if (match && !checkLine.includes("...")) {
          console.log(`✅ FOUND PATTERN 2 (XXX-X):`, match[0]);
          return {
            openResult: match[1],
            jodiResult: match[2],
            closeResult: match[2],  // Use jodi as close for now
          };
        }

        // Try pattern 3: Just numbers (e.g., 156 25 267)
        match = checkLine.match(/(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
        if (match) {
          console.log(`✅ FOUND PATTERN 3 (space-separated):`, match[0]);
          return {
            openResult: match[1],
            jodiResult: match[2],
            closeResult: match[3],
          };
        }
      }
      
      console.log(`❌ No result format found after market`);
    }
  }

  console.log("❌ MARKET NOT FOUND - tried to match:", `"${cleanMarket}"`);
  console.log("========== SCRAPING SATKAMATKA END ==========\n");
  return {};
}

// ================= SATTA KING FAST LIVE RESULTS =================
export async function scrapeLiveResults(marketName: string): Promise<ScrapedResult> {
  try {
    console.log("\n========== 🔴 [LIVE] SCRAPING SATTA KING FAST START ==========");
    console.log("Market:", `"${marketName}"`);

    const result = await scrapeSattaKingFast(marketName);

    console.log("🔎 [LIVE] Scrape result:", result);
    return result;
  } catch (error) {
    console.error("[LIVE] Error:", error);
    return {};
  }
}

// ================= MAIN FUNCTION =================// ================= MAIN FUNCTION =================
export async function fetchAndUpdateMarketResult(
  marketId: number
) {
  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, marketId));

  if (!market) {
    return { success: false, message: "Market not found" };
  }

  if (!market.sourceUrl) {
    return { success: false, message: "No source URL" };
  }

  // ✅ Check if current time is after openTime + 10 minutes
  if (!isAfterOpenWindow(market.openTime)) {
    const { hours, minutes } = parseTimeString(market.openTime);
    const openWindow = timeToMinutes(hours, minutes) + 10;
    const openHrs = Math.floor(openWindow / 60) % 24;
    const openMins = openWindow % 60;
    const windowTimeStr = `${String(openHrs).padStart(2, '0')}:${String(openMins).padStart(2, '0')}`;
    return { 
      success: false, 
      message: `Can fetch only after ${windowTimeStr} (openTime: ${market.openTime} + 10 min)` 
    };
  }

  let scraped: ScrapedResult;

  try {
    scraped = await scrapeResult(market.sourceUrl, market.name);

    console.log("========== RESULT DEBUG ==========");
    console.log("Market:", market.name);
    console.log("Open:", scraped.openResult);
    console.log("Jodi:", scraped.jodiResult);
    console.log("Close:", scraped.closeResult);
    console.log("==================================");

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db.insert(scraperLogsTable).values({
      marketId: market.id,
      marketName: market.name,
      sourceUrl: market.sourceUrl,
      success: false,
      errorMessage,
    });

    return { success: false, message: errorMessage };
  }

  const isValid =
    scraped.openResult &&
    scraped.closeResult &&
    scraped.jodiResult;

  if (!isValid) {
    console.log("❌ INVALID RESULT — NOT SAVING");
    return { success: false, message: "Invalid result" };
  }

  // ✅ TODAY's DATE (not YESTERDAY)
  const resultDateStr = getTodayDateIST();

  const [existingResult] = await db
    .select()
    .from(resultsTable)
    .where(
      and(
        eq(resultsTable.marketId, marketId),
        eq(resultsTable.resultDate, resultDateStr)
      )
    );

  if (existingResult) {
    await db.update(resultsTable).set({
      openResult: scraped.openResult,
      closeResult: scraped.closeResult,
      jodiResult: scraped.jodiResult,
    }).where(eq(resultsTable.id, existingResult.id));
  } else {
    await db.insert(resultsTable).values({
      marketId: market.id,
      resultDate: resultDateStr,
      openResult: scraped.openResult,
      closeResult: scraped.closeResult,
      jodiResult: scraped.jodiResult,
    });
  }

  await db.update(marketsTable).set({
    lastFetchedAt: new Date(),
    fetchError: null,
  }).where(eq(marketsTable.id, marketId));

  await db.insert(scraperLogsTable).values({
    marketId: market.id,
    marketName: market.name,
    sourceUrl: market.sourceUrl,
    success: true,
    openResult: scraped.openResult,
    closeResult: scraped.closeResult,
    jodiResult: scraped.jodiResult,
  });

  return {
    success: true,
    message: "✅ Result saved (first page only) - TODAY's date",
    data: scraped,
  };
}