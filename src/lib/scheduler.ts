import * as cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { db, marketsTable, markets2Table, resultsTable, results2Table, bidsTable } from "@workspace/db";
import { fetchAndUpdateMarketResult } from "./scraper.js";
import { fetchAndUpdateMarkets2Result, updateMarket2ActivityStatus } from "./scraper2.js";
import { processMarketBidsPreClose, processMarketBids } from "./bid-processor.js";
import { getTodayDateIST, parseTimeString } from "./date-utils.js";

let schedulerTask: cron.ScheduledTask | null = null;
let midnightResetTask: cron.ScheduledTask | null = null;
let lastRunAt: Date | null = null;
let lastMidnightResetDate: string | null = null;  // Track last reset date (YYYY-MM-DD)
let isRunning = false;
let lastMarketStatus: Map<number, boolean> = new Map(); // Track market status changes to detect closures
const SCHEDULER_INTERVAL_MINUTES = 5;

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

function isMarketWithinResultWindow(market: { openTime: string; closeTime: string }): boolean {
  const current = getCurrentTimeInMinutes();
  const { hours: openHour, minutes: openMinute } = parseTimeString(market.openTime);
  const { hours: closeHour, minutes: closeMinute } = parseTimeString(market.closeTime);
  const open = timeToMinutes(openHour, openMinute);
  const close = timeToMinutes(closeHour, closeMinute);

  if (open <= close) {
    return current >= open && current < close;
  }

  // Support markets whose close time is after midnight.
  return current >= open || current < close;
}

function hasMarketClosedForResult(market: { openTime: string; closeTime: string }): boolean {
  const current = getCurrentTimeInMinutes();
  const { hours: openHour, minutes: openMinute } = parseTimeString(market.openTime);
  const { hours: closeHour, minutes: closeMinute } = parseTimeString(market.closeTime);
  const open = timeToMinutes(openHour, openMinute);
  const close = timeToMinutes(closeHour, closeMinute);

  if (open <= close) {
    return current >= close;
  }

  return current >= close && current < open;
}

function hasPlaceholderResultRow(result: { openResult?: string | null; closeResult?: string | null; jodiResult?: string | null }): boolean {
  const values = [result.openResult, result.closeResult, result.jodiResult];
  return values.some(value => {
    if (value === null || value === undefined) return true;
    const trimmed = String(value).trim();
    if (!trimmed) return true;
    if (/^[xX]+$/.test(trimmed)) return true;
    if (/^[0-9]$/.test(trimmed)) return true;
    return false;
  });
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

/**
 * Process today's pending bids for closed markets
 * Finds all pending bids whose markets have closed and have results, processes them automatically
 */
async function processTodaysPendingBidsForClosedMarkets() {
  try {
    // Get all pending bids
    const pendingBids = await db.select({
      id: bidsTable.id,
      marketId: bidsTable.marketId,
      status: bidsTable.status,
    })
      .from(bidsTable)
      .where(eq(bidsTable.status, "pending"));

    if (pendingBids.length === 0) {
      return; // No pending bids, nothing to do
    }

    console.log(`[Bid Processor] Found ${pendingBids.length} total pending bids`);

    // Group bids by market
    const bidsByMarket = new Map<number, typeof pendingBids>();
    for (const bid of pendingBids) {
      if (!bidsByMarket.has(bid.marketId)) {
        bidsByMarket.set(bid.marketId, []);
      }
      bidsByMarket.get(bid.marketId)!.push(bid);
    }

    const todayDate = getTodayDateIST();
    let processedCount = 0;

    // Check each market and process bids if market is closed and has result
    for (const [marketId, bids] of bidsByMarket) {
      const [market] = await db.select().from(marketsTable)
        .where(eq(marketsTable.id, marketId));
      
      if (!market) {
        continue;
      }

      // Check if market is closed (isActive = false)
      if (market.isActive) {
        continue;
      }

      // Check if market has result
      const results = await db.select().from(resultsTable)
        .where(eq(resultsTable.marketId, marketId));

      if (results.length === 0) {
        continue;
      }

      // Get the latest result
      const result = results[results.length - 1];

      // Process bids for this closed market with result
      console.log(`[Bid Processor] ⏱️ Market closed - Processing ${bids.length} pending bids for: ${market.name}`);
      
      try {
        const marketResult = {
          openResult: result.openResult || undefined,
          closeResult: result.closeResult || undefined,
          jodiResult: result.jodiResult || undefined,
          pannaResult: result.pannaResult || undefined,
        };

        await processMarketBids(marketId, marketResult);
        console.log(`[Bid Processor] ✅ Successfully processed bids for market ${market.name}`);
        processedCount++;
      } catch (error) {
        console.error(`[Bid Processor] ❌ Error processing bids for market ${market.name}:`, error);
      }
    }

    if (processedCount > 0) {
      console.log(`[Bid Processor] 📋 Processed ${processedCount} markets with pending bids`);
    }
  } catch (err) {
    console.error("[Bid Processor] Error in processTodaysPendingBidsForClosedMarkets:", err);
  }
}

export function startScheduler() {
  if (schedulerTask) {
    console.log("[Scheduler] Already running");
    return;
  }

  // The scrape loop is heavy and can exceed a one-minute timer, so use a 5-minute cadence
  // to avoid repeated missed-execution warnings and overlapping jobs.
  schedulerTask = cron.schedule(`*/${SCHEDULER_INTERVAL_MINUTES} * * * *`, async () => {
    if (isRunning) {
      console.log("[Scheduler] Previous run still in progress, skipping...");
      return;
    }

    isRunning = true;
    lastRunAt = new Date();
    console.log(`[Scheduler] Running at ${lastRunAt.toISOString()}`);

    try {
      await db.execute?.('select 1');
    } catch {
      console.error("[Scheduler] DB not reachable (skipping this tick): ECONNREFUSED/connection error");
      isRunning = false;
      return;
    }

    try {
      await updateMarketActivityStatus();
      await updateMarket2ActivityStatus();
      await processTodaysPendingBidsForClosedMarkets();

      const markets = await db.select().from(marketsTable)
        .where(eq(marketsTable.autoUpdate, true));

      const justClosedMarkets: typeof markets = [];
      for (const market of markets) {
        const wasActive = lastMarketStatus.get(market.id);
        const isNowActive = market.isActive;
        
        if (wasActive === true && isNowActive === false) {
          console.log(`[Scheduler] 🔴 Market just closed: ${market.name} - fetching results immediately`);
          justClosedMarkets.push(market);
        }
        
        lastMarketStatus.set(market.id, isNowActive);
      }

      const autoUpdateMarkets = markets.filter(m => isMarketWithinResultWindow(m));
      const markets2 = await db.select().from(markets2Table)
        .where(eq(markets2Table.autoUpdate, true));
      const autoUpdateMarkets2 = markets2;

      if (autoUpdateMarkets.length === 0 && autoUpdateMarkets2.length === 0) {
        console.log("[Scheduler] No markets with auto-update enabled");
        isRunning = false;
        return;
      }

      if (autoUpdateMarkets.length > 0) {
        console.log(`\n[Scheduler] 📊 MARKETS1 - Fetching ${autoUpdateMarkets.length} market(s)...`);
        const results = await Promise.allSettled(
          autoUpdateMarkets.map(market => fetchAndUpdateMarketResult(market.id))
        );

        results.forEach((result, i) => {
          const market = autoUpdateMarkets[i];
          if (result.status === "fulfilled") {
            console.log(`[Scheduler] 📊 ${result.value.message}`);
          } else {
            console.error(`[Scheduler] 📊 ${market.name}: Failed - ${result.reason}`);
          }
        });
      }

      const closedMarkets = await db.select().from(marketsTable)
        .where(eq(marketsTable.isActive, false))
        .where(eq(marketsTable.autoUpdate, true));
      
      console.log(`[Scheduler] 🔍 Total CLOSED markets in DB: ${closedMarkets.length}`);
      
      if (closedMarkets.length > 0) {
        const todayDate = getTodayDateIST();
        console.log(`[Scheduler] 📅 Today's date: ${todayDate}`);
        
        const todayResults = await db.select({
          marketId: resultsTable.marketId,
          resultDate: resultsTable.resultDate,
          openResult: resultsTable.openResult,
          closeResult: resultsTable.closeResult,
          jodiResult: resultsTable.jodiResult,
        })
          .from(resultsTable)
          .where(eq(resultsTable.resultDate, todayDate));
          
        const validTodayResultMarketIds = new Set(
          todayResults
            .filter(r => !hasPlaceholderResultRow(r))
            .map(r => r.marketId)
        );
        const marketsNeedingResults = closedMarkets.filter(m => hasMarketClosedForResult(m) && !validTodayResultMarketIds.has(m.id));
          
        marketsNeedingResults.forEach(market => {
          console.log(`[Scheduler] ├─ ${market.name} (ID: ${market.id}): Has result = false`);
        });
        
        if (marketsNeedingResults.length > 0) {
          console.log(`\n[Scheduler] 🔒 CLOSED MARKETS1 - Fetching ${marketsNeedingResults.length} market(s) missing results...\n`);
          const closedResults = await Promise.allSettled(
            marketsNeedingResults.map(market => fetchAndUpdateMarketResult(market.id))
          );
          
          closedResults.forEach((result, i) => {
            const market = marketsNeedingResults[i];
            if (result.status === "fulfilled") {
              console.log(`[Scheduler] 🔒 ${result.value.message}`);
            } else {
              console.error(`[Scheduler] 🔐 ${market.name}: Failed - ${result.reason}`);
            }
          });
        } else {
          console.log(`[Scheduler] ✅ All closed markets have today's results`);
        }

        if (autoUpdateMarkets.length > 0) {
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
      }

      if (autoUpdateMarkets2.length > 0) {
        console.log(`\n[Scheduler] 📈 MARKETS2 - Fetching ${autoUpdateMarkets2.length} market(s)...`);
        const results2 = await Promise.allSettled(
          autoUpdateMarkets2.map(market => fetchAndUpdateMarkets2Result(market.id))
        );

        results2.forEach((result, i) => {
          const market = autoUpdateMarkets2[i];
          if (result.status === "fulfilled") {
            console.log(`[Scheduler] 📈 ${result.value.message}`);
          } else {
            console.error(`[Scheduler] 📈 ${market.name}: Failed - ${result.reason}`);
          }
        });
      }
    } catch (err) {
      console.error("[Scheduler] Error:", err);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[Scheduler] Started — running every ${SCHEDULER_INTERVAL_MINUTES} minutes`);

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
