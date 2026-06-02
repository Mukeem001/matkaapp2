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
  // Puppeteer not available - will use axios fallback
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
  // reduces crashes when Render/LB is slow
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
    /Just a moment|Enable JavaScript and cookies|Checking your browser|cf-browser-verification|Cloudflare Ray ID|Please allow access to the website|Checking whether the network connection|turnstile|cf-challenge|cf_clearance/i.test(body)
  );
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
            let body = await page.evaluate(() => {
              const doc = document as any;
              return doc.body?.innerText || "";
            }).catch(() => "");

            // If it looks like CF challenge, retry using a less strict navigation strategy
            if (isCloudflareBlock(body, status) || isCloudflareBlock(content, status)) {
              try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 2500));
                content = await page.content();
                body = await page.evaluate(() => {
                  const doc = document as any;
                  return doc.body?.innerText || "";
                }).catch(() => "");
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
          const errorMsg = String(puppeteerError);
          if (errorMsg.includes("Could not find Chrome") || errorMsg.includes("ENOENT") || errorMsg.includes("Puppeteer not available")) {
            usePuppeteer = false;
            lastError = puppeteerError;
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

          // Check for Cloudflare/WAF blocks
          if (isCloudflareBlock(String(response.data || ""), response.status)) {
            // Cloudflare/WAF block detected: retrying wastes time and spams logs.
            throw new Error(`Website blocking requests (CF/WAF) status=${response.status}`);
          }


          if (response.status >= 500) {
            throw new Error(`HTTP ${response.status} - Server Error`);
          }

          if (response.status === 403 && (!response.data || response.data.length < 1000)) {
            const waitTime = attempt * 10000 + Math.floor(Math.random() * 6000);
            if (attempt < attempts) {
              await sleep(waitTime);
              continue;
            }
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
              delay = (10000 * attempt) + Math.floor(Math.random() * 8000);
            } else if (errorMsg.includes("timeout") || errorMsg.includes("ECONNRESET")) {
              delay = (4000 * attempt) + Math.floor(Math.random() * 3000);
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
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("fetchUrl failed");
}


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

function findSattaKingFastMarketResult($: cheerio.CheerioAPI, marketName: string): ScrapedResult {
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

// ================= SATT A KING FAST SCRAPER =================
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
    console.error(`[Scraper] scrapeSattaKingFast error: ${errorMsg}`);
    return {};
  }
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
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    const cleanMarket = normalizeScrapeLine(marketName);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = normalizeScrapeLine(line);
      const marketFound = cleanLine === cleanMarket || (` ${cleanLine} `).includes(` ${cleanMarket} `);

      if (marketFound) {
        // Search in next 5 lines for results (try multiple regex patterns)
        for (let j = i; j < i + 5 && j < lines.length; j++) {
          const checkLine = lines[j];

          // Try pattern 1: XXX-XX-XXX (e.g., 156-25-267)
          let match = checkLine.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);
          if (match) {
            return {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[3],
            };
          }

          // Try pattern 2: XXX-X (e.g., 567-8)
          match = checkLine.match(/(\d{1,3})-(\d{1,3})(?!-)/);
          if (match && !checkLine.includes("...")) {
            return {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[2],
            };
          }

          // Try pattern 3: Just numbers (e.g., 156 25 267)
          match = checkLine.match(/(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
          if (match) {
            return {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[3],
            };
          }
        }
      }
    }

    return {};
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Scraper] Error fetching ${marketName}: ${errorMsg}`);
    return {};
  }
}

// ================= AKINGSATTA.IN (MARKETS2 FALLBACK) =================
export async function scrapeAkingSattaComIn(
  marketName: string,
  opts?: { forceProxy?: boolean }
): Promise<ScrapedResult> {
  try {
    console.log(`[Scraper] Fetching from akingsatta.in for ${marketName}`);
    
    // Try multiple URLs for akingsatta.in
    const urls = [
      "https://akingsatta.in/",
      "https://www.akingsatta.in/",
      "https://akingsatta.com/",
    ];
    
    let response: any = null;
    let lastError: any = null;
    
    for (const url of urls) {
      try {
        console.log(`[Scraper] Trying ${url}...`);
        response = await fetchUrl(url, { ...opts, forceProxy: true, retryCount: 2 });
        if (response && response.data && response.data.length > 500) {
          console.log(`[Scraper] ✅ Fetched ${response.data.length} bytes from ${url}`);
          break;
        }
      } catch (err) {
        lastError = err;
        console.log(`[Scraper] ❌ Failed ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
    
    if (!response || !response.data) {
      console.error(`[Scraper] ❌ Could not fetch. Last error: ${lastError}`);
      return {};
    }

    const $ = cheerio.load(response.data);
    
    // Try multiple selectors
    let text = $("body").text();
    
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    
    console.log(`[Scraper] Parsing ${lines.length} lines from page for market: ${marketName}`);

    const cleanMarket = normalizeScrapeLine(marketName);

    // First pass: Show all potential market names on page (for debugging)
    const potentialMarkets = [];
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i];
      if (line && line.length > 3 && !line.includes("http") && !line.includes("©") && !line.match(/^\d+$/)) {
        potentialMarkets.push(line);
      }
    }
    console.log(`[Scraper] Potential market names on page: ${potentialMarkets.slice(0, 20).join(" | ")}`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = normalizeScrapeLine(line);
      
      // ✅ STRICT MATCHING: Only match if cleanLine === cleanMarket (exact match only)
      const isExactMatch = cleanLine === cleanMarket;
      
      if (isExactMatch) {
        console.log(`\n[Scraper] 🎯 EXACT MATCH found at line ${i}`);
        console.log(`[Scraper]   Looking for: "${cleanMarket}"`);
        console.log(`[Scraper]   Found line: "${line}"`);
        
        // Search next 12 lines - skip time labels, pick first result
        let foundResult: any = null;
        
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          const checkLine = lines[j];

          // Skip time labels (e.g., "at 10:20 PM") and chart labels
          if (checkLine.match(/^at\s+\d{1,2}:\d{2}\s+[AP]M$/) || checkLine.includes("Chart") || checkLine.includes("ध्यान दें")) {
            console.log(`[Scraper]   Skipping label [line ${j}]: "${checkLine}"`);
            continue;
          }

          // Skip empty/short lines
          if (checkLine.length < 2) continue;

          // Try pattern 1: XXX-XX-XXX (e.g., 156-25-267)
          let match = checkLine.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);
          if (match) {
            console.log(`[Scraper]   ✅ Pattern 1 matched [line ${j}]: "${checkLine}" → ${match[1]}-${match[2]}-${match[3]}`);
            foundResult = {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[3],
            };
            break;
          }

          // Try pattern 2: XXX-X (e.g., 567-8)
          match = checkLine.match(/(\d{1,3})-(\d{1,3})(?!-)/);
          if (match && !checkLine.includes("...")) {
            console.log(`[Scraper]   ✅ Pattern 2 matched [line ${j}]: "${checkLine}" → ${match[1]}-${match[2]}`);
            foundResult = {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[2],
            };
            break;
          }

          // Try pattern 3: Space-separated (e.g., 156 25 267)
          match = checkLine.match(/(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
          if (match) {
            console.log(`[Scraper]   ✅ Pattern 3 matched [line ${j}]: "${checkLine}" → ${match[1]} ${match[2]} ${match[3]}`);
            foundResult = {
              openResult: match[1],
              jodiResult: match[2],
              closeResult: match[3],
            };
            break;
          }

          // Try pattern 4: ONLY 2 digits (for markets2)
          match = checkLine.match(/^(\d{2})$/);
          if (match) {
            console.log(`[Scraper]   ✅ Pattern 4 matched [line ${j}]: "${checkLine}" → ${match[1]}`);
            foundResult = {
              openResult: match[1].charAt(0),
              jodiResult: match[1],
              closeResult: match[1].charAt(1),
            };
            break;
          }
        }
        
        if (foundResult) {
          console.log(`[Scraper] ✅ RETURNING RESULT for ${marketName}:`, foundResult);
          return foundResult;
        } else {
          console.log(`[Scraper] ⚠️ No result pattern found in next 12 lines`);
        }
      }
    }
    
    console.log(`[Scraper] ❌ Market "${cleanMarket}" not found on page`);
    console.log(`[Scraper] Attempting fuzzy/partial match as fallback...`);
    
    // Fallback: Try partial/fuzzy matching
    const marketWords = cleanMarket.split(/\s+/).filter(w => w.length > 0);
    if (marketWords.length === 0) return {};
    
    console.log(`[Scraper] Searching for partial match with words: [${marketWords.join(", ")}]`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = normalizeScrapeLine(line);
      const lineWords = cleanLine.split(/\s+/);
      
      // Check if ALL market words exist in this line
      let allWordsFound = true;
      for (const marketWord of marketWords) {
        if (!lineWords.includes(marketWord)) {
          allWordsFound = false;
          break;
        }
      }
      
      if (allWordsFound) {
        console.log(`[Scraper] 🔄 FUZZY MATCH found at line ${i}: "${line}"`);
        
        // Search next 12 lines for result
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          const checkLine = lines[j];
          
          if (checkLine.match(/^at\s+\d{1,2}:\d{2}\s+[AP]M$/) || checkLine.includes("Chart")) continue;
          if (checkLine.length < 2) continue;
          
          let match = checkLine.match(/^(\d{2})$/);
          if (match) {
            console.log(`[Scraper] ✅ Fuzzy match result: "${checkLine}" → ${match[1]}`);
            return {
              openResult: match[1].charAt(0),
              jodiResult: match[1],
              closeResult: match[1].charAt(1),
            };
          }
        }
      }
    }
    
    console.log(`[Scraper] ❌ No result found for ${marketName} (exact or fuzzy)`);
    return {};
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Scraper] Error fetching from akingsatta.in for ${marketName}: ${errorMsg}`);
    return {};
  }
}

// ================= MARKETS2 LIVE RESULTS (SATTA-KING-FAST.COM + AKINGSATTA FALLBACK) =================
export async function scrapeLiveResults(marketName: string, opts?: { forceProxy?: boolean }): Promise<ScrapedResult> {
  try {
    // Markets2 uses akingsatta.in only
    console.log(`[Scraper] Markets2 - Fetching from akingsatta.in for ${marketName}`);
    const akingSattaResult = await scrapeAkingSattaComIn(marketName, opts).catch(() => ({}));
    return akingSattaResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Scraper] Error fetching live results for ${marketName}: ${errorMsg}`);
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
    console.error(`[Scraper] Error fetching ${market.name}: ${errorMessage}`);

    await db.insert(scraperLogsTable).values({
      marketId: market.id,
      marketName: market.name,
      sourceUrl: market.sourceUrl || "no-url",
      success: false,
      errorMessage,
    });

    return { success: false, message: errorMessage };
  }

  // ✅ Accept partial results - at least ONE field must be present
  // Website may delay publishing all fields after market closes
  if (!scraped.openResult && !scraped.closeResult && !scraped.jodiResult) {
    return { success: false, message: "Result not found" };
  }

  // Clean/validate the results (remove empty strings, use "XX" for missing values)
  const cleanedOpen = String(scraped.openResult || "XX").trim();
  const cleanedJodi = String(scraped.jodiResult || "XX").trim();
  const cleanedClose = String(scraped.closeResult || "XX").trim();

  console.log(`[Scraper] Result for ${market.name}:`);
  console.log(`  └─ Open: ${cleanedOpen}, Jodi: ${cleanedJodi}, Close: ${cleanedClose}`);

  // ✅ Save to database with TODAY's date (IST)
  const resultDateStr = getTodayDateIST();
  console.log(`[Scraper] Saving result for date: ${resultDateStr}`);

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
    console.log(`[Scraper] ✏️ Updating existing result (ID: ${existingResult.id})`);
    await db.update(resultsTable).set({
      openResult: cleanedOpen,
      closeResult: cleanedClose,
      jodiResult: cleanedJodi,
    }).where(eq(resultsTable.id, existingResult.id));
  } else {
    console.log(`[Scraper] ✅ Creating new result for ${market.name}`);
    await db.insert(resultsTable).values({
      marketId: market.id,
      resultDate: resultDateStr,
      openResult: cleanedOpen,
      closeResult: cleanedClose,
      jodiResult: cleanedJodi,
    });
  }

  // Update market table
  console.log(`[Scraper] Updating markets table with results`);
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