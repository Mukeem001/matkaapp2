import { db, markets2Table, results2Table } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { format } from "date-fns";
import { scrapeLiveResults } from "./scraper.js";

/**
 * FETCH AND UPDATE MARKETS2 RESULT - With Real Scraping
 */

async function fetchAndUpdateMarkets2Result(marketId: number) {
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
    const liveResult = await scrapeLiveResults(market.name);
    
    console.log(`[Market2] Scrape result:`, liveResult);
    
    // Check if we have ANY result
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;
    
    if (hasAnyResult) {
      console.log(`[Market2] Saving results to database for ${market.name}`);
      
      // Save to results2_table with TODAY'S DATE
      const today = format(new Date(), "yyyy-MM-dd");
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
          
          // Build update object with only fields that have values
          const updateObject: any = {};
          if (liveResult.openResult) updateObject.openResult = liveResult.openResult;
          if (liveResult.jodiResult) updateObject.jodiResult = liveResult.jodiResult;
          if (liveResult.closeResult) updateObject.closeResult = liveResult.closeResult;
          
          // Only update if we have at least one field to update
          if (Object.keys(updateObject).length > 0) {
            console.log(`[Market2] Update data:`, updateObject);
            await db.update(results2Table)
              .set(updateObject)
              .where(eq(results2Table.id, existingResult.id));
            console.log(`[Market2] Update completed`);
          } else {
            console.log(`[Market2] No data to update`);
          }
        } else {
          console.log(`[Market2] Creating new result for market ${marketId}`);
          const insertData: any = {
            marketId,
            resultDate: today,
          };
          if (liveResult.openResult) insertData.openResult = liveResult.openResult;
          if (liveResult.jodiResult) insertData.jodiResult = liveResult.jodiResult;
          if (liveResult.closeResult) insertData.closeResult = liveResult.closeResult;
          
          console.log(`[Market2] Insert data:`, insertData);
          await db.insert(results2Table).values(insertData);
          console.log(`[Market2] Insert completed`);
        }
        
        // Update markets2 table with latest results
        console.log(`[Market2] Updating markets2 table with latest results`);
        const marketUpdateFields: any = {
          lastFetchedAt: new Date(),
          fetchError: null
        };
        if (liveResult.openResult) marketUpdateFields.openResult = liveResult.openResult;
        if (liveResult.jodiResult) marketUpdateFields.jodiResult = liveResult.jodiResult;
        if (liveResult.closeResult) marketUpdateFields.closeResult = liveResult.closeResult;
        
        const updated = await db.update(markets2Table)
          .set(marketUpdateFields)
          .where(eq(markets2Table.id, marketId))
          .returning();
        console.log(`[Market2] Markets2 table updated`);
        
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