import * as cron from "node-cron";
import { eq } from "drizzle-orm";
import { db, marketsTable, markets2Table } from "@workspace/db";
import { fetchAndUpdateMarketResult } from "./scraper.js";
import { fetchAndUpdateMarkets2Result, updateMarket2ActivityStatus } from "./scraper2.js";
import { processMarketBidsPreClose } from "./bid-processor.js";

let schedulerTask: cron.ScheduledTask | null = null;
let midnightResetTask: cron.ScheduledTask | null = null;
let lastRunAt: Date | null = null;
let isRunning = false;

// Helper function to parse time string (HH:MM format)
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

// Helper function to get current time in minutes since midnight
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Helper function to convert hours and minutes to minutes since midnight
function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

// Daily reset at midnight - set all markets to isActive = true
async function resetMarketsAtMidnight() {
  try {
    const now = new Date();
    const timeStr = now.toISOString();
    
    const result = await db.update(marketsTable)
      .set({ isActive: true });
    
    console.log(`[Daily Reset] At ${timeStr}: All markets reset to isActive = true`);
  } catch (err) {
    console.error("[Daily Reset] Error:", err);
  }
}

// Update market isActive status based on openTime
// BETTING WINDOW logic:
// - isActive = TRUE: From 00:00 until (openTime - 10 min) — users can place bets
// - isActive = FALSE: From (openTime - 10 min) until 23:59 — market locked, no new bets
// - Cycle repeats next day
async function updateMarketActivityStatus() {
  try {
    const markets = await db.select().from(marketsTable);
    const currentTimeInMinutes = getCurrentTimeInMinutes();

    for (const market of markets) {
      const { hours: openHour, minutes: openMin } = parseTimeString(market.openTime);
      const openTimeInMinutes = timeToMinutes(openHour, openMin);

      // Pre-open window: 10 minutes before market opens
      const preOpenWindowStart = openTimeInMinutes - 10;

      // Market is ACTIVE (betting allowed) only BEFORE the pre-open window
      const shouldBeActive = currentTimeInMinutes < preOpenWindowStart;

      // Update if status changed
      if (market.isActive !== shouldBeActive) {
        await db.update(marketsTable)
          .set({ isActive: shouldBeActive })
          .where(eq(marketsTable.id, market.id));
        
        const currentTimeStr = `${String(Math.floor(currentTimeInMinutes / 60)).padStart(2, '0')}:${String(currentTimeInMinutes % 60).padStart(2, '0')}`;
        const preOpenStr = `${String(Math.floor(preOpenWindowStart / 60)).padStart(2, '0')}:${String(preOpenWindowStart % 60).padStart(2, '0')}`;
        console.log(`[Market Activity] ${market.name}: isActive = ${shouldBeActive} (betting closes at ${preOpenStr}, currentTime: ${currentTimeStr})`);
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

    try {
      // Update market activity status (Market 1)
      await updateMarketActivityStatus();

      // Update market2 activity status (Market 2)
      await updateMarket2ActivityStatus();

      // Get all markets with autoUpdate enabled and a source URL
      const markets = await db.select().from(marketsTable)
        .where(eq(marketsTable.autoUpdate, true));

      const autoUpdateMarkets = markets.filter(m => m.sourceUrl);

      // Get all markets2 with autoUpdate enabled and a source URL
      const markets2 = await db.select().from(markets2Table)
        .where(eq(markets2Table.autoUpdate, true));

      const autoUpdateMarkets2 = markets2.filter(m => m.sourceUrl);

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
