import * as cron from "node-cron";
import { eq } from "drizzle-orm";
import { db, marketsTable, markets2Table } from "@workspace/db";
import { fetchAndUpdateMarketResult } from "./scraper.js";
import { fetchAndUpdateMarkets2Result, updateMarket2ActivityStatus } from "./scraper2.js";
import { processMarketBidsPreClose } from "./bid-processor.js";

let schedulerTask: cron.ScheduledTask | null = null;
let midnightResetTask: cron.ScheduledTask | null = null;
let lastRunAt: Date | null = null;
let lastMidnightResetDate: string | null = null;  // Track last reset date (YYYY-MM-DD)
let isRunning = false;

// Helper function to parse time string (HH:MM format)
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

// Helper function to get current time in minutes since midnight (IST)
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  // Convert to IST timezone for consistent time calculations
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return istTime.getHours() * 60 + istTime.getMinutes();
}

// Helper function to convert hours and minutes to minutes since midnight
function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

// Daily reset at midnight IST - set all markets to isActive = true
// This allows betting to start from 00:00 when new day begins
// Also handles case where server restarts during the day - ensures reset runs at least once per day
async function resetMarketsAtMidnight() {
  try {
    // Get current time in IST
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    
    // Get today's date in IST (YYYY-MM-DD format)
    const istDateStr = istTime.toISOString().split('T')[0];
    
    // Reset if: (1) it's 00:00-00:01 IST OR (2) we haven't reset today yet
    const shouldReset = (hours === 0 && minutes <= 1) || (lastMidnightResetDate !== istDateStr);
    
    if (shouldReset) {
      console.log(`[Midnight Reset] 🌙 IST Time: ${istTime.toLocaleTimeString()} (Date: ${istDateStr})`);
      
      // Reset Market1
      await db.update(marketsTable)
        .set({ isActive: true });
      
      console.log(`[Midnight Reset] ✅ All Market1 reset to isActive = true`);
      
      // Reset Market2
      await db.update(markets2Table)
        .set({ isActive: true });
      
      console.log(`[Midnight Reset] ✅ All Market2 reset to isActive = true`);
      
      // Update last reset date
      lastMidnightResetDate = istDateStr;
      console.log(`[Midnight Reset] ✅ Reset completed for ${istDateStr}. Betting enabled for all markets`);
    }
  } catch (err) {
    console.error("[Midnight Reset] Error:", err);
  }
}

// Update market isActive status based on closeTime ONLY
// MARKET ACTIVITY LOGIC:
// - isActive = TRUE: From 00:00 until (closeTime - 10 min) — market is open for bets
// - isActive = FALSE: From (closeTime - 10 min) until 23:59 — market is closed
// - Next day at 00:00, cycle repeats
async function updateMarketActivityStatus() {
  try {
    const markets = await db.select().from(marketsTable);
    const currentTimeInMinutes = getCurrentTimeInMinutes();

    for (const market of markets) {
      const { hours: closeHour, minutes: closeMin } = parseTimeString(market.closeTime);
      const closeTimeInMinutes = timeToMinutes(closeHour, closeMin);

      // Market should close 10 minutes BEFORE official close time
      const autoCloseTime = closeTimeInMinutes - 10;

      // Market is ACTIVE only from 00:00 until (closeTime - 10 minutes)
      // Once we reach 10 minutes before close, market becomes inactive for rest of day
      const shouldBeActive = currentTimeInMinutes < autoCloseTime;

      // Update if status changed
      if (market.isActive !== shouldBeActive) {
        await db.update(marketsTable)
          .set({ isActive: shouldBeActive })
          .where(eq(marketsTable.id, market.id));
        
        const currentTimeStr = `${String(Math.floor(currentTimeInMinutes / 60)).padStart(2, '0')}:${String(currentTimeInMinutes % 60).padStart(2, '0')}`;
        const closeTimeStr = `${String(Math.floor(closeTimeInMinutes / 60)).padStart(2, '0')}:${String(closeTimeInMinutes % 60).padStart(2, '0')}`;
        const autoCloseStr = `${String(Math.floor(autoCloseTime / 60)).padStart(2, '0')}:${String(autoCloseTime % 60).padStart(2, '0')}`;
        
        console.log(`[Market Activity] ${market.name}: isActive = ${shouldBeActive}`);
        console.log(`  └─ Official close: ${closeTimeStr}, Auto-closes at: ${autoCloseStr}, Current: ${currentTimeStr}`);
      }
    }
  } catch (err) {
    console.error("[Market Activity] Error updating market activity status:", err);
  }
}

export function startScheduler() {
  if (schedulerTask) {
    console.log("[Scheduler] Already running");
    return;
  }

  // Run every minute
  schedulerTask = cron.schedule("* * * * *", async () => {
    if (isRunning) {
      console.log("[Scheduler] Previous run still in progress, skipping...");
      return;
    }

    isRunning = true;
    lastRunAt = new Date();
    console.log(`[Scheduler] Running at ${lastRunAt.toISOString()}`);

    // If DB is down (ECONNREFUSED), avoid spamming logs every minute.
    try {
      await db.execute?.('select 1');
    } catch {
      console.error("[Scheduler] DB not reachable (skipping this tick): ECONNREFUSED/connection error");
      isRunning = false;
      return;
    }

    try {
      // Update market activity status (Market 1)
      await updateMarketActivityStatus();

      // Update market2 activity status (Market 2)
      await updateMarket2ActivityStatus();

      // Get all markets with autoUpdate enabled and a source URL
      const markets = await db.select().from(marketsTable)
        .where(eq(marketsTable.autoUpdate, true));

      const autoUpdateMarkets = markets.filter(m => m.sourceUrl);

      // Get all markets2 with autoUpdate enabled
      const markets2 = await db.select().from(markets2Table)
        .where(eq(markets2Table.autoUpdate, true));

      const autoUpdateMarkets2 = markets2;

      if (autoUpdateMarkets.length === 0 && autoUpdateMarkets2.length === 0) {
        console.log("[Scheduler] No markets with auto-update enabled");
        isRunning = false;
        return;
      }

      // Fetch results for Market 1
      if (autoUpdateMarkets.length > 0) {
        console.log(`[Scheduler] Fetching results for ${autoUpdateMarkets.length} market(s)...`);

        const results = await Promise.allSettled(
          autoUpdateMarkets.map(market => fetchAndUpdateMarketResult(market.id))
        );

        results.forEach((result, i) => {
          const market = autoUpdateMarkets[i];
          if (result.status === "fulfilled") {
            console.log(`[Scheduler] ${market.name}: ${result.value.message}`);
          } else {
            console.error(`[Scheduler] ${market.name}: Failed - ${result.reason}`);
          }
        });

        // 🎯 After fetching results, process bids automatically
        console.log(`[Scheduler] Processing bids for ${autoUpdateMarkets.length} market(s)...`);
        const bidResults = await Promise.allSettled(
          autoUpdateMarkets.map(market => processMarketBidsPreClose(market.id))
        );

        bidResults.forEach((result, i) => {
          const market = autoUpdateMarkets[i];
          if (result.status === "fulfilled") {
            console.log(`[Scheduler] ${market.name} bids: ${result.value.message}`);
          } else {
            console.error(`[Scheduler] ${market.name} bids: Failed - ${result.reason}`);
          }
        });
      }

      // Fetch results for Market 2
      if (autoUpdateMarkets2.length > 0) {
        console.log(`[Scheduler] Fetching results for ${autoUpdateMarkets2.length} market2(s)...`);

        const results2 = await Promise.allSettled(
          autoUpdateMarkets2.map(market => fetchAndUpdateMarkets2Result(market.id))
        );

        results2.forEach((result, i) => {
          const market = autoUpdateMarkets2[i];
          if (result.status === "fulfilled") {
            console.log(`[Scheduler] ${market.name}: ${result.value.message}`);
          } else {
            console.error(`[Scheduler] ${market.name}: Failed - ${result.reason}`);
          }
        });
      }
    } catch (err) {
      console.error("[Scheduler] Error:", err);
    } finally {
      isRunning = false;
    }
  });

  console.log("[Scheduler] Started — running every minute");

  // Register daily reset at midnight
  if (midnightResetTask) {
    console.log("[Daily Reset] Already scheduled");
    return;
  }

  midnightResetTask = cron.schedule("0 0 * * *", async () => {
    console.log("[Daily Reset] Triggering at 00:00...");
    await resetMarketsAtMidnight();
  });

  console.log("[Daily Reset] Scheduled to run at 00:00 UTC daily");
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("[Scheduler] Stopped");
  }

  if (midnightResetTask) {
    midnightResetTask.stop();
    midnightResetTask = null;
    console.log("[Daily Reset] Stopped");
  }
}

export function getSchedulerStatus() {
  return {
    isRunning: schedulerTask !== null,
    lastRunAt: lastRunAt?.toISOString() ?? null,
  };
}

// Export for debug endpoints
export { updateMarketActivityStatus };
