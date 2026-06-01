import * as cheerio from "cheerio";
import { eq, and } from "drizzle-orm";
import { format } from "date-fns";
import axios from "axios";
import { db, marketsTable, scraperLogsTable, resultsTable } from "@workspace/db";
import { getTodayDateIST } from "./date-utils";

let puppeteer: any = null;

try {
  puppeteer = require("puppeteer");
} catch {
  console.warn("[Scraper] Puppeteer not available - will use axios fallback only");
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--single-process",
  "--no-zygote",
];

const browserLaunchOptions = {
  headless: true,
  ignoreHTTPSErrors: true,
  args: CHROME_ARGS,
  defaultViewport: { width: 1366, height: 768 },
  timeout: 60000,
  protocolTimeout: 120000,
};



let sharedBrowser: any = null;

async function getBrowser(): Promise<any> {
  if (!puppeteer) {
    throw new Error("Puppeteer not available");
  }

  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  sharedBrowser = await puppeteer.launch(browserLaunchOptions);
  return sharedBrowser;
}

async function closeBrowser(): Promise<void> {
  if (!sharedBrowser) {
    return;
  }

  try {
    await sharedBrowser.close();
  } catch {
    // ignore close errors
  }

  sharedBrowser = null;
}

if (typeof process !== "undefined") {
  process.on("beforeExit", () => {
    closeBrowser().catch(() => undefined);
  });
  process.on("SIGINT", () => {
    closeBrowser().catch(() => undefined);
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isCloudflareBlock(body: string, status?: number): boolean {
  return (
    status === 403 ||
    status === 429 ||
    status === 503 ||
    /Just a moment|Enable JavaScript and cookies|Checking your browser|cf-browser-verification|Cloudflare Ray ID|Please allow access to the website|Checking whether the network connection|turnstile|cf-challenge|cf_clearance|cf-clearance/i.test(body)
  );
}


const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function fetchUrl(url: string, opts?: { retryCount?: number; forceProxy?: boolean }) {
  const attempts = opts?.retryCount ? Math.max(1, opts.retryCount) : 4;

  let lastError: unknown;
  let usePuppeteer = true;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Try Puppeteer first (if available)
      if (usePuppeteer) {
        try {
          const browser = await getBrowser();
          let page: any | undefined;

          try {
            page = await browser.newPage();

            // light fingerprint randomization (proxy-free)
            const ua = pick(USER_AGENTS);
            const viewport = pick(VIEWPORTS);

            await page.setUserAgent(ua);
            await page.setExtraHTTPHeaders({
              "Accept-Language": "en-US,en;q=0.9",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Upgrade-Insecure-Requests": "1",
            });
            await page.setCacheEnabled(false);
            await page.setViewport(viewport);
            await page.setDefaultNavigationTimeout(45000);
            await page.setDefaultTimeout(45000);

            const response = await page.goto(url, {
              waitUntil: "networkidle2",
              timeout: 45000,
            });

            const status = response?.status();

            await new Promise(resolve => setTimeout(resolve, 2500));

            let content = await page.content();
            let body = await page
              .evaluate(() => (document as any).body?.innerText || "")
              .catch(() => "");

            // If it looks like CF challenge, retry using a less strict navigation strategy
            if (isCloudflareBlock(body, status) || isCloudflareBlock(content, status)) {
              try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 2500));
                content = await page.content();
                body = await page.evaluate(() => (document as any).body?.innerText || "").catch(() => "");
              } catch {
                // ignore fallback errors
              }
            }

            if (isCloudflareBlock(body, status) || isCloudflareBlock(content, status)) {
              const snippet = String(body || content || "").slice(0, 250);
              throw new Error(`Cloudflare block detected status=${status} snippet=${snippet}`);
            }

            return { data: content, status } as any;
          } finally {
            if (page) {
              await page.close().catch(() => undefined);
            }
          }
        } catch (puppeteerError: unknown) {
          // Check if this is a Chrome not found error or Puppeteer not available
          const errorMsg = String(puppeteerError);
          if (errorMsg.includes("Could not find Chrome") || errorMsg.includes("ENOENT") || errorMsg.includes("Puppeteer not available")) {
            console.warn("[Scraper] Chrome/Puppeteer not available, falling back to HTTP requests");
            usePuppeteer = false;
            lastError = puppeteerError;
            // Continue to axios fallback
          } else {
            throw puppeteerError;
          }
        }
      }

      // Fallback: Use axios for simple HTTP requests
      if (!usePuppeteer) {
        const ua = pick(USER_AGENTS);
        try {
          const response = await axios.get(url, {
            headers: {
              "User-Agent": ua,
              "Accept-Language": "en-US,en;q=0.9",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Cache-Control": "no-cache",
              "Pragma": "no-cache",
            },
            timeout: 30000,
            validateStatus: () => true,
            decompress: true,
          });

          if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
          }

          return { data: response.data, status: response.status } as any;
        } catch (axiosError) {
          lastError = axiosError;
          if (attempt < attempts) {
            // Add longer delay for axios retries
            const delay = 2000 * attempt + Math.floor(Math.random() * 1500);
            await sleep(delay);
          } else {
            throw axiosError;
          }
        }
      }
    } catch (error: unknown) {
      lastError = error;
      await closeBrowser();
      if (attempt < attempts) {
        const delay = 1500 * attempt + Math.floor(Math.random() * 800);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("fetchUrl failed");
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
  marketName: string,
  opts?: { forceProxy?: boolean }
): Promise<ScrapedResult> {
  try {
    const response = await fetchUrl(SATTA_KING_FAST_URL, opts);

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

    console.log(`[Scraper] Satta King Fast - Found ${lines.length} lines for market "${marketName}"`);
    
    return findMarketResult(lines, marketName);
  } catch (error) {
    console.error(`[Scraper] Error in scrapeSattaKingFast:`, error);
    return {};
  }
}

export async function scrapeResult(
  url: string,
  marketName?: string,
  opts?: { forceProxy?: boolean }
): Promise<ScrapedResult> {

  if (marketName) {
    if (url.includes("satta-king-fast.com")) {
      return await scrapeSattaKingFast(marketName, opts);
    }
    if (url.includes("satkamatka.com.in")) {
      return await scrapeSattaMatkaComIn(marketName, opts);
    }
  }


  const response = await fetchUrl(url, opts);

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
  marketName: string,
  opts?: { forceProxy?: boolean }
): Promise<ScrapedResult> {

  const response = await fetchUrl("https://satkamatka.com.in/", opts);

  const $ = cheerio.load(response.data);
  const text = $("body").text();

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);  // Keep all lines

  console.log("\n========== 🔍 SCRAPING SATKAMATKA ==========");
  console.log("Market to find:", `"${marketName}"`);
  console.log("Total lines:", lines.length);

  const cleanMarket = normalizeScrapeLine(marketName);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = normalizeScrapeLine(line);

    const marketFound =
      cleanLine === cleanMarket ||
      cleanLine.includes(cleanMarket) ||
      cleanMarket.includes(cleanLine);

    if (marketFound) {
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
export async function scrapeLiveResults(marketName: string, opts?: { forceProxy?: boolean }): Promise<ScrapedResult> {
  try {
    console.log("\n========== 🔴 [LIVE] SCRAPING SATTA KING FAST START ==========");
    console.log("Market:", `"${marketName}"`);

    const result = await scrapeSattaKingFast(marketName, opts);

    console.log("🔎 [LIVE] Scrape result:", result);
    return result;
  } catch (error) {
    console.error("[LIVE] Error:", error);
    return {};
  }
}

// ================= MAIN FUNCTION =================
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

  let scraped: ScrapedResult = {};

  try {
    // Try to scrape using sourceUrl if available
    if (market.sourceUrl) {
      scraped = await scrapeResult(market.sourceUrl, market.name);
    } else {
      // Fallback: Try scraping from all known sources by market name
      console.log(`[Scraper] No sourceUrl for ${market.name}, trying all sources...`);
      
      // Try satta-king-fast first
      scraped = await scrapeSattaKingFast(market.name).catch(() => ({}));
      
      if (!scraped.closeResult) {
        // Try satkamatka if satta-king-fast didn't work
        scraped = await scrapeSattaMatkaComIn(market.name).catch(() => ({}));
      }
    }

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
      sourceUrl: market.sourceUrl || "no-url",
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
    openResult: scraped.openResult,
    closeResult: scraped.closeResult,
    jodiResult: scraped.jodiResult,
  }).where(eq(marketsTable.id, marketId));

  await db.insert(scraperLogsTable).values({
    marketId: market.id,
    marketName: market.name,
    sourceUrl: market.sourceUrl || "no-url",
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