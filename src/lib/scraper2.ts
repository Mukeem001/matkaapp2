import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { db, markets2Table, results2Table } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * MAIN FETCH FUNCTION
 */

async function fetchAndUpdateMarkets2Result(marketId: number) {

  try {

    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      return { success:false,message:`Market ${marketId} not found`,data:null };
    }

    if (!market.sourceUrl) {
      return { success:false,message:`No sourceUrl configured`,data:null };
    }

    console.log(`[Market2] Scraping ${market.name}`);

    const result = await scrapeMarkets2Result(
      market.sourceUrl,
      market.name
    );

    if (!result) {

      await db.update(markets2Table)
        .set({
          fetchError:"Result not found",
          lastFetchedAt:new Date()
        })
        .where(eq(markets2Table.id,marketId));

      return { success:false,message:"Result not found",data:null };
    }

    if (!isValidResult(result)) {

      await db.update(markets2Table)
        .set({
          fetchError:`Invalid result ${result}`,
          lastFetchedAt:new Date()
        })
        .where(eq(markets2Table.id,marketId));

      return { success:false,message:"Invalid result",data:null };
    }

    const today = new Date().toISOString().split("T")[0];

    const updated = await db.update(markets2Table)
      .set({
        openResult:result,
        closeResult:result,
        jodiResult:result,
        fetchError: result === "XX" ? "Result not declared" : null,
        lastFetchedAt:new Date()
      })
      .where(eq(markets2Table.id,marketId))
      .returning();

    await db.insert(results2Table)
      .values({
        marketId,
        resultDate:today,
        result
      })
      .onConflictDoNothing();

    return {
      success:true,
      message:`Updated ${result}`,
      data:updated[0]
    };

  } catch(err){

    const errorMsg = err instanceof Error ? err.message : String(err);

    await db.update(markets2Table)
      .set({
        fetchError:errorMsg,
        lastFetchedAt:new Date()
      })
      .where(eq(markets2Table.id,marketId));

    return { success:false,message:errorMsg,data:null };
  }
}

/**
 * SCRAPER - Uses Puppeteer to bypass Cloudflare
 */

async function scrapeMarkets2Result(
  url:string,
  marketName:string
):Promise<string|null>{

  let browser;
  
  try{
    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Important for Render (limited /dev/shm)
      ]
    });

    const page = await browser.newPage();
    
    // Set timeout and navigate
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for the table to load
    await page.waitForSelector('table tr', { timeout: 10000 });

    // Get the HTML content
    const html = await page.content();
    const $ = cheerio.load(html);

    const rows = $("table tr");

    const cleanTarget = marketName
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/[^a-z0-9]/g,"");

    for(let i=0;i<rows.length;i++){

      const row = $(rows[i]);
      const cols = row.find("td");

      if(cols.length < 3) continue;

      const marketCell = $(cols[0]).text().trim();

      const cleanName = marketCell
        .toLowerCase()
        .replace(/\s+/g,"")
        .replace(/[^a-z0-9]/g,"");

      if(cleanName.includes(cleanTarget)){

        console.log(`[Puppeteer] Market found: ${marketCell}`);

        // cols[1] = yesterday, cols[2] = today
        const yesterdayText = $(cols[1]).text().trim();
        const todayText = $(cols[2]).text().trim();

        const todayResult = cleanResult(todayText);
        const yesterdayResult = cleanResult(yesterdayText);

        console.log(`[Puppeteer] Yesterday: ${yesterdayText} → ${yesterdayResult}`);
        console.log(`[Puppeteer] Today: ${todayText} → ${todayResult}`);

        // Always return today's result (even if XX)
        if(todayResult){
          await browser.close();
          return todayResult;
        }

        // Fallback to yesterday only if today is completely empty
        if(yesterdayResult){
          await browser.close();
          return yesterdayResult;
        }

        await browser.close();
        return null;
      }
    }

    console.log(`[Puppeteer] Market "${marketName}" not found`);
    await browser.close();
    return null;

  }catch(err){

    console.error("[Puppeteer Error]",err);

    if(browser){
      await browser.close();
    }

    return null;
  }
}

/**
 * CLEAN RESULT
 */

function cleanResult(val:string):string{

  if(!val) return "";

  const trimmed = val.trim().toUpperCase();

  if(trimmed === "XX") return "XX";

  const match = trimmed.match(/\d{2}/);

  if(match) return match[0];

  const digits = trimmed.replace(/\D/g,"");

  if(digits.length >= 2){
    return digits.substring(0,2);
  }

  if(digits.length === 1){
    return "0"+digits;
  }

  return "";
}

/**
 * VALIDATE RESULT
 */

function isValidResult(val:string):boolean{

  if(!val) return false;

  return /^\d{2}$/.test(val) || val === "XX";
}

/**
 * RANDOM USER AGENT
 */

function getRandomUserAgent():string{

  const agents=[

"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",

"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",

"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",

"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko Firefox/124"

  ];

  return agents[Math.floor(Math.random()*agents.length)];
}

/**
 * ACTIVITY STATUS
 */

async function updateMarket2ActivityStatus(){

  const markets = await db.select().from(markets2Table);

  const now = new Date();

  const ist = new Date(
    now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"})
  );

  const current =
    ist.getHours()*60 + ist.getMinutes();

  for(const market of markets){

    const [closeH,closeM] = market.closeTime
      .split(":")
      .map(Number);

    const close = closeH*60 + closeM;

    const autoClose = close - 10;

    const shouldBeActive = current < autoClose;

    if(market.isActive !== shouldBeActive){

      await db.update(markets2Table)
        .set({isActive:shouldBeActive})
        .where(eq(markets2Table.id,market.id));

      console.log(
        `[Market Activity] ${market.name} → ${shouldBeActive}`
      );
    }
  }
}

export{
fetchAndUpdateMarkets2Result,
scrapeMarkets2Result,
updateMarket2ActivityStatus
};