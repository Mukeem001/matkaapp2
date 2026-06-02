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
      return { success: false, message: `Market ${marketId} not found`, data: null };
    }

    console.log(`[Market2] Fetching result for ${market.name}`);

    // Scrape live results using real scraper (gets both today and yesterday)
    const liveResult = await scrapeLiveResults(market.name, opts);
    
    console.log(`[Market2] 📍 Market DB name: "${market.name}"`);
    console.log(`[Market2] 🔍 Scrape result:`, JSON.stringify(liveResult, null, 2));
    
    // Check if we have ANY result (today's)
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;
    
    if (!hasAnyResult) {
      console.log(`[Market2] ❌ No result found for ${market.name}. Open: ${liveResult.openResult}, Jodi: ${liveResult.jodiResult}, Close: ${liveResult.closeResult}`);
      return { success: false, message: `No result found for ${market.name}`, data: null };
    }
    
    if (hasAnyResult) {
      // Format TODAY'S result
      const rawJodi = liveResult.jodiResult || liveResult.closeResult || liveResult.openResult || '00';
      const formatted = formatMarkets2Result(rawJodi);
      
      console.log(`[Market2] ✅ Found result for ${market.name}`);
      console.log(`[Market2] Raw jodi: ${rawJodi}`);
      console.log(`[Market2] Formatted: open=${formatted.openResult}, jodi=${formatted.jodiResult}, close=${formatted.closeResult}`);
      
      // Save TODAY'S result to results2_table
      const today = getTodayDateIST();
      console.log(`[Market2] Today's date: ${today}`);
      
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
        console.log(`[Market2] Today's result check: ${existingTodayResult ? existingTodayResult.id : "new"}`);
        
        if (existingTodayResult) {
          console.log(`[Market2] ✏️ Updating today's result ID: ${existingTodayResult.id}`);
          await db.update(results2Table)
            .set({
              result: formatted.jodiResult,
            })
            .where(eq(results2Table.id, existingTodayResult.id));
        } else {
          console.log(`[Market2] ✅ Creating today's result for market ${marketId}`);
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
          
          console.log(`[Market2] 📅 Saving yesterday's result: ${formattedYesterday.jodiResult} for date ${yesterday}`);
          
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
            console.log(`[Market2] ✏️ Updating yesterday's result ID: ${existingYesterdayResult.id}`);
            await db.update(results2Table)
              .set({
                result: formattedYesterday.jodiResult,
              })
              .where(eq(results2Table.id, existingYesterdayResult.id));
          } else {
            console.log(`[Market2] ✅ Creating yesterday's result for market ${marketId}`);
            await db.insert(results2Table).values({
              marketId,
              resultDate: yesterday,
              result: formattedYesterday.jodiResult,
            });
          }
        }
        
        // Update markets2 table with TODAY'S result for quick display
        const marketUpdateData: any = {
          lastFetchedAt: new Date(),
          fetchError: null,
          openResult: formatted.openResult,
          jodiResult: formatted.jodiResult,
          closeResult: formatted.closeResult,
        };

        console.log(`[Market2] Updating markets2 table with today's formatted results`);
        const updated = await db.update(markets2Table)
          .set(marketUpdateData)
          .where(eq(markets2Table.id, marketId))
          .returning();
        console.log(`[Market2] Markets2 table updated`);

        // Process bids2 with the properly formatted jodi result
        if (formatted.jodiResult && formatted.jodiResult !== 'XX') {
          console.log(`[Market2] Processing bids2 for market ${marketId} with result ${formatted.jodiResult}`);
          try {
            await processMarkets2Bids(marketId, formatted.jodiResult);
            console.log(`[Market2] Bids2 processing completed`);
          } catch (error) {
            console.error(`[Market2] Error processing bids2:`, error);
          }
        }
        
        return {
          success: true,
          message: `📈 M2 → ${market.name}: ${formatted.openResult}-${formatted.jodiResult}-${formatted.closeResult}`,
          data: updated[0]
        };
      } catch (dbError) {
        console.error(`[Market2] Database error:`, dbError);
        return {
          success: false,
          message: `Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
          data: null
        };
      }
    } else {
      console.log(`[Market2] No results found`);
      
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
    console.error(`[Market2] Error:`, errorMsg);

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