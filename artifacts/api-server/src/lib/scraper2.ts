import { db, markets2Table, results2Table } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getTodayDateIST } from "../../../../src/lib/date-utils";
import { scrapeLiveResults } from "../../../../src/lib/scraper";
import { processMarkets2Bids } from "../../../../src/lib/bid-processor";

/**
 * FETCH AND UPDATE MARKETS2 RESULT - With Real Scraping
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

    // Scrape live results using real scraper
    const liveResult = await scrapeLiveResults(market.name, opts);
    
    console.log(`[Market2] Scrape result:`, liveResult);
    
    // Check if we have ANY result
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;
    
    if (hasAnyResult) {
      console.log(`[Market2] Saving results to database for ${market.name}`);
      
      // Save to results2_table with TODAY'S IST date only
      const today = getTodayDateIST();
      console.log(`[Market2] Today's date: ${today}`);
      
      try {
        // Check if result exists for today
        const queryResult = await db
          .select()
          .from(results2Table)
          .where(
            and(
              eq(results2Table.marketId, marketId),
              eq(results2Table.resultDate, today)
            )
          );
        
        const existingResult = queryResult[0];
        console.log(`[Market2] Query check completed, existing: ${existingResult ? existingResult.id : "none"}`);
        
        if (existingResult) {
          console.log(`[Market2] Updating existing result ID: ${existingResult.id}`);
          
          try {
            // Update stored single `result` field.
            const resultValue = liveResult.closeResult ?? existingResult.result;
            
            await db.update(results2Table)
              .set({
                result: resultValue ?? "XX",
              })
              .where(eq(results2Table.id, existingResult.id));
            console.log(`[Market2] Update completed successfully`);
          } catch (updateError) {
            console.error(`[Market2] Update error:`, updateError);
            throw updateError;
          }
        } else {
          console.log(`[Market2] Creating new result for market ${marketId}`);
          const insertData: any = {
            marketId,
            resultDate: today,
            result: liveResult.closeResult || 'XX', // Use closeResult as main result, fallback to XX
          };
          
          console.log(`[Market2] Insert data:`, insertData);
          await db.insert(results2Table).values(insertData);
          console.log(`[Market2] Insert completed`);
        }
        
        // Update markets2 table with latest scraped results
        const marketUpdateData: any = {
          lastFetchedAt: new Date(),
          fetchError: null,
        };
        if (liveResult.openResult) marketUpdateData.openResult = liveResult.openResult;
        if (liveResult.jodiResult) marketUpdateData.jodiResult = liveResult.jodiResult;
        if (liveResult.closeResult) marketUpdateData.closeResult = liveResult.closeResult;

        console.log(`[Market2] Updating markets2 table with latest results`);
        const updated = await db.update(markets2Table)
          .set(marketUpdateData)
          .where(eq(markets2Table.id, marketId))
          .returning();
        console.log(`[Market2] Markets2 table updated`);

        // Process bids2 with the result
        const resultValue = liveResult.closeResult || 'XX';
        if (resultValue !== 'XX') {
          console.log(`[Market2] Processing bids2 for market ${marketId} with result ${resultValue}`);
          try {
            await processMarkets2Bids(marketId, resultValue);
            console.log(`[Market2] Bids2 processing completed`);
          } catch (error) {
            console.error(`[Market2] Error processing bids2:`, error);
          }
        }
        
        return {
          success: true,
          message: `Updated with live results`,
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
 * UPDATE MARKET ACTIVE STATUS
 */

async function updateMarket2ActivityStatus() {
  try {
    const markets = await db
      .select()
      .from(markets2Table);

    const now = new Date();

    const ist = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })
    );

    const currentMinutes =
      ist.getHours() * 60 + ist.getMinutes();

    for (const market of markets) {
      try {
        if (
          !market.closeTime ||
          !market.closeTime.includes(":")
        ) {
          console.log(
            `[Market Activity] Invalid closeTime for ${market.name}`
          );
          continue;
        }

        const [closeHour, closeMinute] =
          market.closeTime
            .split(":")
            .map(Number);

        const closeMinutes =
          closeHour * 60 + closeMinute;

        // AUTO CLOSE 10 MIN BEFORE
        const autoCloseMinutes =
          closeMinutes - 10;

        const shouldBeActive =
          currentMinutes < autoCloseMinutes;

        // UPDATE ONLY IF CHANGED
        if (
          market.isActive !== shouldBeActive
        ) {
          await db
            .update(markets2Table)
            .set({
              isActive: shouldBeActive,
            })
            .where(
              eq(
                markets2Table.id,
                market.id
              )
            );

          console.log(
            `[Market Activity] ${market.name} => ${shouldBeActive}`
          );
        }
      } catch (marketErr) {
        console.error(
          `[Market Activity] Error in ${market.name}`,
          marketErr
        );
      }
    }
  } catch (err) {
    console.error(
      `[Market Activity] Main Error =>`,
      err
    );
  }
}

export {
  fetchAndUpdateMarkets2Result,
  updateMarket2ActivityStatus,
};