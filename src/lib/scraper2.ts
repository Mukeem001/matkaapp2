import { db, markets2Table, results2Table } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * SIMPLIFIED FETCH FUNCTION - No Scraping
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

    console.log(`[Market2] Updating ${market.name} status`);

    const today = new Date().toISOString().split("T")[0];

    // Simply set result to XX (not declared/pending)
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

    // Store in history
    await db.insert(results2Table)
      .values({
        marketId,
        resultDate: today,
        result: "XX"
      })
      .onConflictDoNothing();

    return {
      success: true,
      message: `Updated XX (result not declared)`,
      data: updated[0]
    };

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