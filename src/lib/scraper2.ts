import { db, markets2Table, results2Table } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getTodayDateIST, getYesterdayDateIST } from "./date-utils.js";
import { scrapeLiveResults } from "./scraper.js";
import { processMarkets2Bids } from "./bid-processor.js";

/**
 * Format a 2-digit jodi result into open/jodi/close components
 * Example: "25" → { openResult: "2", jodiResult: "25", closeResult: "5" }
 */
function formatMarkets2Result(jodiNumber: string): { openResult: string; jodiResult: string; closeResult: string } {
  const cleanNumber = String(jodiNumber).trim();
  
  if (cleanNumber.length === 2) {
    return {
      openResult: cleanNumber.charAt(0),
      jodiResult: cleanNumber,
      closeResult: cleanNumber.charAt(1),
    };
  }
  
  // If it's a 3-digit number like "156", extract as: open=1, jodi=56, close=6
  if (cleanNumber.length === 3) {
    return {
      openResult: cleanNumber.charAt(0),
      jodiResult: cleanNumber.substring(1),
      closeResult: cleanNumber.charAt(2),
    };
  }
  
  // Fallback for unexpected formats
  return {
    openResult: cleanNumber,
    jodiResult: cleanNumber,
    closeResult: cleanNumber,
  };
}

/**
 * FETCH AND UPDATE MARKETS2 RESULT - With Real Scraping
 * Now fetches and stores both TODAY'S and YESTERDAY'S results
 */

async function fetchAndUpdateMarkets2Result(marketId: number, opts?: { forceProxy?: boolean }) {
  try {
    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      console.log(`[M2] ❌ Market ID ${marketId} not found`);
      return { success: false, message: `Market ${marketId} not found`, data: null };
    }

    console.log(`[M2] ━━━━━ MARKETS2 SCRAPER START ━━━━━`);
    console.log(`[M2] Market: ${market.name} (ID: ${marketId})`);
    console.log(`[M2] Source: https://akingsatta.in/ (ONLY SOURCE FOR MARKETS2)`);

    // MARKETS2 ALWAYS USES akingsatta.in - NEVER USE OTHER SOURCES
    const liveResult = await scrapeLiveResults(market.name, opts);
    
    console.log(`[M2] 📍 Market DB name: "${market.name}"`);
    console.log(`[M2] 🔍 Raw scrape result:`, JSON.stringify(liveResult, null, 2));
    
    // Check if we have ANY result (today's)
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;
    
    if (!hasAnyResult) {
      console.log(`[M2] ❌ NO RESULT found from akingsatta.in for ${market.name}`);
      console.log(`[M2] ━━━━━ MARKETS2 SCRAPER END (FAILED) ━━━━━`);
      return { success: false, message: `No result found for ${market.name}`, data: null };
    }
    
    if (hasAnyResult) {
      // Format TODAY'S result
      const rawJodi = liveResult.jodiResult || liveResult.closeResult || liveResult.openResult || '00';
      const formatted = formatMarkets2Result(rawJodi);
      
      console.log(`[M2] ✅ RESULT FOUND from akingsatta.in`);
      console.log(`[M2] Raw: ${rawJodi}`);
      console.log(`[M2] Formatted: Open=${formatted.openResult}, Jodi=${formatted.jodiResult}, Close=${formatted.closeResult}`);
      
      // Save TODAY'S result to results2_table
      const today = getTodayDateIST();
      console.log(`[M2] 📅 Today's date: ${today}`);
      
      try {
        // Check if TODAY'S result exists
        const todayQueryResult = await db
          .select()
          .from(results2Table)
          .where(
            and(
              eq(results2Table.marketId, marketId),
              eq(results2Table.resultDate, today)
            )
          );
        
        const existingTodayResult = todayQueryResult[0];
        
        if (existingTodayResult) {
          console.log(`[M2] 🔄 UPDATING today's result (ID: ${existingTodayResult.id})`);
          await db.update(results2Table)
            .set({
              result: formatted.jodiResult,
            })
            .where(eq(results2Table.id, existingTodayResult.id));
        } else {
          console.log(`[M2] 📝 CREATING new today's result`);
          await db.insert(results2Table).values({
            marketId,
            resultDate: today,
            result: formatted.jodiResult,
          });
        }
        
        // SAVE YESTERDAY'S RESULT if available
        if (liveResult.yesterdayJodiResult && liveResult.yesterdayJodiResult !== "XX") {
          const formattedYesterday = formatMarkets2Result(liveResult.yesterdayJodiResult);
          const yesterday = getYesterdayDateIST();
          
          console.log(`[M2] 📅 Yesterday's result: ${formattedYesterday.jodiResult} (Date: ${yesterday})`);
          
          // Check if yesterday's result exists
          const yesterdayQueryResult = await db
            .select()
            .from(results2Table)
            .where(
              and(
                eq(results2Table.marketId, marketId),
                eq(results2Table.resultDate, yesterday)
              )
            );
          
          const existingYesterdayResult = yesterdayQueryResult[0];
          
          if (existingYesterdayResult) {
            console.log(`[M2] 🔄 UPDATING yesterday's result (ID: ${existingYesterdayResult.id})`);
            await db.update(results2Table)
              .set({
                result: formattedYesterday.jodiResult,
              })
              .where(eq(results2Table.id, existingYesterdayResult.id));
          } else {
            console.log(`[M2] 📝 CREATING new yesterday's result`);
            await db.insert(results2Table).values({
              marketId,
              resultDate: yesterday,
              result: formattedYesterday.jodiResult,
            });
          }
        }
        
        // Update markets2 table with TODAY'S result for quick display
        console.log(`[M2] 💾 Saving today's formatted result to markets2 table`);
        const marketUpdateData: any = {
          lastFetchedAt: new Date(),
          fetchError: null,
          openResult: formatted.openResult,
          jodiResult: formatted.jodiResult,
          closeResult: formatted.closeResult,
        };

        console.log(`[M2] 🔄 Updating markets2 table...`);
        const updated = await db.update(markets2Table)
          .set(marketUpdateData)
          .where(eq(markets2Table.id, marketId))
          .returning();
        console.log(`[M2] ✅ Markets2 table updated`);

        // Process bids2 with the properly formatted jodi result
        if (formatted.jodiResult && formatted.jodiResult !== 'XX') {
          console.log(`[M2] 💰 Processing bids2 for result ${formatted.jodiResult}...`);
          try {
            await processMarkets2Bids(marketId, formatted.jodiResult);
            console.log(`[M2] ✅ Bids2 processing completed`);
          } catch (error) {
            console.error(`[M2] ❌ Error processing bids2:`, error);
          }
        }
        
        console.log(`[M2] ━━━━━ MARKETS2 SCRAPER END (SUCCESS) ━━━━━`);
        return {
          success: true,
          message: `📈 M2 → ${market.name}: ${formatted.openResult}-${formatted.jodiResult}-${formatted.closeResult}`,
          data: updated[0]
        };
      } catch (dbError) {
        console.error(`[M2] ❌ Database error:`, dbError);
        console.log(`[M2] ━━━━━ MARKETS2 SCRAPER END (FAILED) ━━━━━`);
        return {
          success: false,
          message: `Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
          data: null
        };
      }
    } else {
      console.log(`[M2] ⚠️ No results found`);
      
      // Update with XX marker
      const updated = await db.update(markets2Table)
        .set({
          openResult: "XX",
          closeResult: "XX",
          jodiResult: "XX",
          fetchError: "Result not declared",
          lastFetchedAt: new Date()
        })
        .where(eq(markets2Table.id, marketId))
        .returning();

      return {
        success: false,
        message: `No live results available - marked as XX`,
        data: updated[0]
      };
    }

  } catch(err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[M2] ❌ Error: ${errorMsg}`);
    console.log(`[M2] ━━━━━ MARKETS2 SCRAPER END (FAILED) ━━━━━`);

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
 * ACTIVITY STATUS - Keep market's active/inactive state updated
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

export {
  fetchAndUpdateMarkets2Result,
  updateMarket2ActivityStatus
};