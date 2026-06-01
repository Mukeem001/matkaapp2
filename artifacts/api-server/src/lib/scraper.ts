import * as cheerio from "cheerio";
import { eq, and } from "drizzle-orm";
import { format } from "date-fns";
import axios from "axios";
import * as http from "http";
import * as https from "https";
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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/119.0",
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

let lastRequestTime = 0;

async function fetchUrl(url: string, opts?: { retryCount?: number; forceProxy?: boolean }) {
  const attempts = url.includes("satta-king-fast.com") ? 10 : (opts?.retryCount ? Math.max(1, opts.retryCount) : 4);

  let lastError: unknown;
  let usePuppeteer = true;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Add request throttling to avoid rate limiting
      const timeSinceLastRequest = Date.now() - lastRequestTime;
      if (timeSinceLastRequest < 1500) {
        await sleep(1500 - timeSinceLastRequest);
      }
      lastRequestTime = Date.now();

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
        const referers = [
          "https://google.com",
          "https://www.google.com/search?q=satta+king+results",
          "https://www.bing.com",
          "https://duckduckgo.com",
        ];
        try {
          const response = await axios.get(url, {
            headers: {
              "User-Agent": ua,
              "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              "Cache-Control": "no-cache",
              "Pragma": "no-cache",
              "Referer": pick(referers),
              "Connection": "keep-alive",
              "Upgrade-Insecure-Requests": "1",
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
              "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              "Sec-Ch-Ua-Mobile": "?0",
              "Sec-Ch-Ua-Platform": '"Windows"',
            },
            timeout: 60000,
            validateStatus: () => true,
            decompress: true,
            maxRedirects: 5,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
          });

          console.log(`[Scraper] Axios request to ${url} got ${response.data?.length || 0} bytes, status ${response.status}`);

          // Check for Cloudflare/WAF blocks even if status is not 400+
          if (isCloudflareBlock(String(response.data || ""), response.status)) {
            throw new Error(`Website blocking requests (CF/WAF) status=${response.status}`);
          }

          if (response.status >= 500) {
            throw new Error(`HTTP ${response.status} - Server Error`);
          }

          // For 403 Forbidden, still try to return the data if it looks like HTML
          if (response.status === 403 && (!response.data || response.data.length < 1000)) {
            throw new Error(`HTTP ${response.status} - Access Denied (likely IP blocked)`);
          }

          return { data: response.data, status: response.status } as any;
        } catch (axiosError: any) {
          lastError = axiosError;
          const errorMsg = String(axiosError?.message || axiosError);
          const is403 = errorMsg.includes("403");
          
          if (attempt < attempts) {
            let delay;
            if (is403) {
              // Very long delays for 403 to avoid repeated blocking
              delay = (10000 * attempt) + Math.floor(Math.random() * 8000);
              console.log(`[Scraper] 403 Error - retry ${attempt}/${attempts} after ${delay}ms (very long delay)`);
            } else if (errorMsg.includes("timeout") || errorMsg.includes("ECONNRESET")) {
              delay = (4000 * attempt) + Math.floor(Math.random() * 3000);
              console.log(`[Scraper] Connection error - retry ${attempt}/${attempts} after ${delay}ms`);
            } else {
              delay = (2000 * attempt) + Math.floor(Math.random() * 1500);
            }
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
        const delay = 2000 * attempt + Math.floor(Math.random() * 1000);
        console.log(`[Scraper] Attempt ${attempt}/${attempts} failed, retrying after ${delay}ms`);
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
  
  // STEP 1: Try exact match first
  for (const row of rows) {
    const $row = $(row);
    const marketText = $row.find("h3.game-name").first().text().trim();
    if (!marketText) continue;

    const cleanRowMarket = normalizeScrapeLine(marketText);
    const isExactMatch = cleanRowMarket === cleanMarket || (` ${cleanRowMarket} `).includes(` ${cleanMarket} `);

    if (isExactMatch) {
      const todayValue = $row.find("td.today-number h3").first().text().trim() ||
        $row.find("td.today-number").first().text().trim();

      if (todayValue) {
        const candidate = parseTwoDigitResult(todayValue);
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  // STEP 2: Try fuzzy/partial match (if exact match fails)
  const marketWords = cleanMarket.split(/\s+/).filter(w => w.length > 0);
  if (marketWords.length === 0) return {};

  for (const row of rows) {
    const $row = $(row);
    const marketText = $row.find("h3.game-name").first().text().trim();
    if (!marketText) continue;

    const cleanRowMarket = normalizeScrapeLine(marketText);
    const lineWords = cleanRowMarket.split(/\s+/);

    // Check if all words from market name exist in this line (in order)
    let allWordsFound = true;
    let lastIndex = -1;
    
    for (const marketWord of marketWords) {
      const foundIndex = lineWords.slice(lastIndex + 1).findIndex(w => w === marketWord);
      if (foundIndex === -1) {
        allWordsFound = false;
        break;
      }
      lastIndex += foundIndex + 1;
    }

    if (allWordsFound) {
      const todayValue = $row.find("td.today-number h3").first().text().trim() ||
        $row.find("td.today-number").first().text().trim();

      if (todayValue) {
        const candidate = parseTwoDigitResult(todayValue);
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  return {};
}

function findMarketResult(lines: string[], marketName: string): ScrapedResult {
  const cleanMarket = normalizeScrapeLine(marketName);

  // STEP 1: Try exact match first
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeScrapeLine(lines[i]);
    if (!line) continue;

    // Match only exact market name (word boundaries)
    const isExactMatch = line === cleanMarket || (` ${line} `).includes(` ${cleanMarket} `);

    if (isExactMatch) {
      // Look in next 6 lines for result
      for (let j = i; j < i + 6 && j < lines.length; j++) {
        const result = parseTwoDigitResult(lines[j]);
        if (result) {
          return result;
        }
      }
    }
  }

  // STEP 2: Try fuzzy/partial match (if exact match fails)
  const marketWords = cleanMarket.split(/\s+/).filter(w => w.length > 0);
  if (marketWords.length === 0) return {};

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeScrapeLine(lines[i]);
    if (!line) continue;

    const lineWords = line.split(/\s+/);

    // Check if all words from market name exist in this line (in order)
    let allWordsFound = true;
    let lastIndex = -1;
    
    for (const marketWord of marketWords) {
      const foundIndex = lineWords.slice(lastIndex + 1).findIndex(w => w === marketWord);
      if (foundIndex === -1) {
        allWordsFound = false;
        break;
      }
      lastIndex += foundIndex + 1;
    }

    if (allWordsFound) {
      // Look in next 6 lines for result
      for (let j = i; j < i + 6 && j < lines.length; j++) {
        const result = parseTwoDigitResult(lines[j]);
        if (result) {
          return result;
        }
      }
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
    
    const result = findMarketResult(lines, marketName);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Suppress Cloudflare/WAF, timeout, and IP blocking errors - these are operational not bugs
    const suppressible = errorMsg.includes("CF/WAF") || errorMsg.includes("Cloudflare") || errorMsg.includes("Website blocking") || errorMsg.includes("timeout") || errorMsg.includes("IP blocked");
    if (!suppressible) {
      console.error(`[Scraper] scrapeSattaKingFast error: ${errorMsg}`);
    }
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
export async function scrapeSattaMatkaComIn(
  marketName: string,
  opts?: { forceProxy?: boolean }
): Promise<ScrapedResult> {
  try {
    const response = await fetchUrl("https://satkamatka.com.in/", opts);

    const $ = cheerio.load(response.data);
    const text = $("body").text();

    const lines = text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    console.log("\n========== 🔍 SCRAPING SATKAMATKA ==========");
    console.log("Looking for market:", `"${marketName}"`);
    console.log("Total lines on page:", lines.length);

    const cleanMarket = normalizeScrapeLine(marketName);
    console.log("Normalized search name:", `"${cleanMarket}"`);

    // Find all potential market names on the page (first 200 lines usually contain them)
    const potentialMarkets = new Set<string>();
    for (let i = 0; i < Math.min(300, lines.length); i++) {
      const cleanLine = normalizeScrapeLine(lines[i]);
      if (cleanLine && cleanLine.length > 2 && cleanLine.length < 50 && !cleanLine.match(/^\d+$/)) {
        potentialMarkets.add(cleanLine);
      }
    }
    
    if (potentialMarkets.size > 0) {
      console.log(`[DEBUG] Found ${potentialMarkets.size} potential market names on page (first 50):`);
      const marketList = Array.from(potentialMarkets).slice(0, 50);
      marketList.forEach(m => console.log(`  - "${m}"`));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = normalizeScrapeLine(line);

      // Match only exact market name (word boundaries to avoid partial matches like SRIDEVI matching SRIDEVI DAY)
      const marketFound =
        cleanLine === cleanMarket ||
        (` ${cleanLine} `).includes(` ${cleanMarket} `);  // Exact word match with space boundaries

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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Scraper] Error in scrapeSattaMatkaComIn: ${errorMsg}`);
    return {};
  }
}

// ================= SATTA KING FAST LIVE RESULTS =================
export async function scrapeLiveResults(marketName: string, opts?: { forceProxy?: boolean }): Promise<ScrapedResult> {
  try {
    console.log("\n========== 🔴 [MARKETS2] SCRAPING START ==========");
    console.log("Market:", `"${marketName}"`);

    // Try satta-king-fast.com first
    console.log("[Scraper] Markets2 - Attempting satta-king-fast.com...");
    const sattaKingResult = await scrapeSattaKingFast(marketName, opts).catch(err => {
      console.log(`[Scraper] satta-king-fast.com failed: ${err.message}`);
      return {};
    });

    if (sattaKingResult.openResult || sattaKingResult.jodiResult || sattaKingResult.closeResult) {
      console.log("✅ [MARKETS2] RESULT FOUND from satta-king-fast.com:", sattaKingResult);
      console.log("========== [MARKETS2] SCRAPING END - SUCCESS ==========");
      return sattaKingResult;
    }

    // Fallback to satkamatka.com.in if satta-king-fast.com fails or returns empty
    console.log("[Scraper] Fallback: Trying satkamatka.com.in for Markets2...");
    const satkamatkaResult = await scrapeSattaMatkaComIn(marketName, opts).catch(err => {
      console.log(`[Scraper] satkamatka.com.in also failed: ${err.message}`);
      return {};
    });

    if (satkamatkaResult.openResult || satkamatkaResult.jodiResult || satkamatkaResult.closeResult) {
      console.log("✅ [MARKETS2] RESULT FOUND from satkamatka.com.in (fallback):", satkamatkaResult);
      console.log("========== [MARKETS2] SCRAPING END - SUCCESS (FALLBACK) ==========");
      return satkamatkaResult;
    }

    console.log("❌ [MARKETS2] RESULT NOT FOUND on both sources");
    console.log("========== [MARKETS2] SCRAPING END - FAILED ==========");
    return {};

  } catch (error) {
    console.error("[MARKETS2] Error:", error);
    console.log("========== [MARKETS2] SCRAPING END - ERROR ==========");
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
      // Markets1 uses satkamatka.com.in
      scraped = await scrapeSattaMatkaComIn(market.name).catch(() => ({}));
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Suppress Cloudflare/WAF, timeout, and IP blocking errors - these are operational not bugs
    const suppressible = errorMessage.includes("CF/WAF") || errorMessage.includes("Cloudflare") || errorMessage.includes("Website blocking") || errorMessage.includes("timeout") || errorMessage.includes("IP blocked");
    if (!suppressible) {
      console.error(`[Scraper] Error fetching ${market.name}: ${errorMessage}`);
    }

    await db.insert(scraperLogsTable).values({
      marketId: market.id,
      marketName: market.name,
      sourceUrl: market.sourceUrl || "no-url",
      success: false,
      errorMessage,
    });

    return { success: false, message: errorMessage };
  }

  // Validate all fields are present
  if (!scraped.openResult || !scraped.closeResult || !scraped.jodiResult) {
    return { success: false, message: "Result not found" };
  }

  // Clean/validate the results (remove empty strings, ensure proper format)
  const cleanedOpen = String(scraped.openResult).trim();
  const cleanedJodi = String(scraped.jodiResult).trim();
  const cleanedClose = String(scraped.closeResult).trim();

  if (!cleanedOpen || !cleanedJodi || !cleanedClose) {
    return { success: false, message: "Result values are empty" };
  }

  // ✅ Save to database with TODAY's date (IST)
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
      openResult: cleanedOpen,
      closeResult: cleanedClose,
      jodiResult: cleanedJodi,
    }).where(eq(resultsTable.id, existingResult.id));
  } else {
    await db.insert(resultsTable).values({
      marketId: market.id,
      resultDate: resultDateStr,
      openResult: cleanedOpen,
      closeResult: cleanedClose,
      jodiResult: cleanedJodi,
    });
  }

  // Update market table
  await db.update(marketsTable).set({
    lastFetchedAt: new Date(),
    fetchError: null,
    openResult: cleanedOpen,
    closeResult: cleanedClose,
    jodiResult: cleanedJodi,
  }).where(eq(marketsTable.id, marketId));

  // Log success
  await db.insert(scraperLogsTable).values({
    marketId: market.id,
    marketName: market.name,
    sourceUrl: market.sourceUrl || "satkamatka.com.in",
    success: true,
    openResult: cleanedOpen,
    closeResult: cleanedClose,
    jodiResult: cleanedJodi,
  });

  return {
    success: true,
    message: `📊 M1 → ${market.name}: ${cleanedOpen}-${cleanedJodi}-${cleanedClose}`,
    data: { openResult: cleanedOpen, jodiResult: cleanedJodi, closeResult: cleanedClose },
  };
}