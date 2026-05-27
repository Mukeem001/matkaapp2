import { Router, type IRouter } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import { format } from "date-fns";
import { db, marketsTable, scraperLogsTable, resultsTable } from "@workspace/db";
import { GetScraperLogsQueryParams, UpdateMarketAutoConfigParams, UpdateMarketAutoConfigBody, FetchMarketResultNowParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { fetchAndUpdateMarketResult, scrapeLiveResults } from "../lib/scraper.js";
import { getSchedulerStatus } from "../lib/scheduler.js";

const router: IRouter = Router();

const formatMarket = (m: typeof marketsTable.$inferSelect) => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
  lastFetchedAt: m.lastFetchedAt?.toISOString() ?? null,
});

// Debug route
router.get("/debug", (_req, res): void => {
  res.json({ message: "Scraper routes working", timestamp: new Date().toISOString() });
});

router.put("/markets/:id/auto-config", authMiddleware, async (req, res): Promise<void> => {
  const params = UpdateMarketAutoConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const body = UpdateMarketAutoConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [market] = await db.update(marketsTable).set({
    autoUpdate: body.data.autoUpdate,
    sourceUrl: body.data.sourceUrl ?? null,
  }).where(eq(marketsTable.id, params.data.id)).returning();

  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  res.json(formatMarket(market));
});

router.post("/markets/:id/fetch-now", authMiddleware, async (req, res): Promise<void> => {
  const params = FetchMarketResultNowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // Get date from query parameter (format: "yyyy-MM-dd")
  const selectedDate = (req.query.date as string) || undefined;
  
  const result = await fetchAndUpdateMarketResult(params.data.id);
  res.json(result);
});

router.get("/markets/:id/live-results", authMiddleware, async (req, res): Promise<void> => {
  console.log("🔴 [LIVE-RESULTS] Request received");
  console.log("🔴 [LIVE-RESULTS] req.params:", req.params);
  
  const params = FetchMarketResultNowParams.safeParse(req.params);
  
  if (!params.success) {
    console.error("🔴 [LIVE-RESULTS] Validation failed:", params.error);
    res.status(400).json({ error: "Invalid ID", details: params.error });
    return;
  }

  console.log("🟢 [LIVE-RESULTS] Validated params:", params.data);

  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, params.data.id));

  if (!market) {
    console.error("🔴 [LIVE-RESULTS] Market not found:", params.data.id);
    res.status(400).json({ error: "Market not found" });
    return;
  }

  console.log("🟢 [LIVE-RESULTS] Market found:", market.name);

  try {
    const liveResult = await scrapeLiveResults(market.name);
    
    console.log("� [LIVE-RESULTS] Scrape result:", liveResult);
    
    // Success if we have ANY result
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;
    
    if (hasAnyResult) {
      console.log("🟢 [LIVE-RESULTS] Saving to database");
      
      // Save to database with TODAY'S DATE
      const today = format(new Date(), "yyyy-MM-dd");
      console.log("🟢 [LIVE-RESULTS] Today's date:", today);
      
      try {
        const [existingResult] = await db
          .select()
          .from(resultsTable)
          .where(
            and(
              eq(resultsTable.marketId, params.data.id),
              eq(resultsTable.resultDate, today)
            )
          );
        
        console.log("🟢 [LIVE-RESULTS] Query check completed, existing:", existingResult ? existingResult.id : "none");
        
        if (existingResult) {
          console.log("🟢 [LIVE-RESULTS] Updating existing result ID:", existingResult.id);
          const updateData: any = {};
          if (liveResult.openResult) updateData.openResult = liveResult.openResult;
          if (liveResult.jodiResult) updateData.jodiResult = liveResult.jodiResult;
          if (liveResult.closeResult) updateData.closeResult = liveResult.closeResult;
          updateData.declaredAt = new Date();
          
          console.log("🟢 [LIVE-RESULTS] Update data:", updateData);
          const updateResult = await db.update(resultsTable).set(updateData).where(eq(resultsTable.id, existingResult.id));
          console.log("🟢 [LIVE-RESULTS] Update completed:", updateResult);
        } else {
          console.log("🟢 [LIVE-RESULTS] Creating new result for market", params.data.id);
          const insertData: any = {
            marketId: params.data.id,
            resultDate: today,
            declaredAt: new Date(),
          };
          if (liveResult.openResult) insertData.openResult = liveResult.openResult;
          if (liveResult.jodiResult) insertData.jodiResult = liveResult.jodiResult;
          if (liveResult.closeResult) insertData.closeResult = liveResult.closeResult;
          
          console.log("🟢 [LIVE-RESULTS] Insert data:", insertData);
          const insertResult = await db.insert(resultsTable).values(insertData);
          console.log("🟢 [LIVE-RESULTS] Insert completed:", insertResult);
        }
        
        // 🟢 ALSO UPDATE MARKETS TABLE WITH LATEST RESULTS
        console.log("🟢 [LIVE-RESULTS] Updating markets table with latest results");
        const marketUpdateData: any = {};
        if (liveResult.openResult) marketUpdateData.openResult = liveResult.openResult;
        if (liveResult.jodiResult) marketUpdateData.jodiResult = liveResult.jodiResult;
        if (liveResult.closeResult) marketUpdateData.closeResult = liveResult.closeResult;
        marketUpdateData.lastFetchedAt = new Date();
        
        await db.update(marketsTable).set(marketUpdateData).where(eq(marketsTable.id, params.data.id));
        console.log("🟢 [LIVE-RESULTS] Markets table updated");
        
        console.log("🟢 [LIVE-RESULTS] Saving to scraper logs");
        const logResult = await db.insert(scraperLogsTable).values({
          marketId: market.id,
          marketName: market.name,
          sourceUrl: market.sourceUrl ?? "https://satta-king-fast.com/",
          success: true,
          openResult: liveResult.openResult,
          closeResult: liveResult.closeResult,
          jodiResult: liveResult.jodiResult,
        });
        console.log("🟢 [LIVE-RESULTS] Log saved:", logResult);
        
        console.log("🟢 [LIVE-RESULTS] Returning saved results");
        res.json({
          success: true,
          message: "Live results found and saved to database",
          data: liveResult,
        });
      } catch (dbError) {
        console.error("🔴 [LIVE-RESULTS] Database error:", dbError);
        res.status(500).json({
          success: false,
          message: `Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
          data: null,
        });
      }
    } else {
      console.log("🔴 [LIVE-RESULTS] No results found");
      res.json({
        success: false,
        message: "No live results available",
        data: null,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("🔴 [LIVE-RESULTS] Exception:", errorMsg);
    res.status(500).json({ 
      success: false, 
      message: errorMsg,
      data: null,
    });
  }
});

router.get("/markets/:id/results/:date", authMiddleware, async (req, res): Promise<void> => {
  const marketId = parseInt(String(req.params.id));
  const resultDate = req.params.date as string; // format: "yyyy-MM-dd"

  if (!marketId || isNaN(marketId)) {
    res.status(400).json({ error: "Invalid market ID" });
    return;
  }

  try {
    const results = await db.select()
      .from(resultsTable)
      .where(and(
        eq(resultsTable.marketId, marketId),
        eq(resultsTable.resultDate, resultDate)
      ));

    const result = results[0];

    if (!result) {
      res.json({ success: false, message: "No results found for this date", data: null });
      return;
    }

    res.json({
      success: true,
      message: "Results found",
      data: {
        openResult: result.openResult,
        closeResult: result.closeResult,
        jodiResult: result.jodiResult,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

router.get("/scraper/logs", authMiddleware, async (req, res): Promise<void> => {
  const query = GetScraperLogsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 50) : 50;

  const logs = await db.select().from(scraperLogsTable)
    .orderBy(desc(scraperLogsTable.createdAt))
    .limit(limit);

  res.json(logs.map(l => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  })));
});

router.get("/scraper/status", authMiddleware, async (_req, res): Promise<void> => {
  const { isRunning, lastRunAt } = getSchedulerStatus();

  const [countResult] = await db.select({ total: count() }).from(marketsTable)
    .where(eq(marketsTable.autoUpdate, true));

  res.json({
    isRunning,
    totalMarketsWithAutoUpdate: countResult?.total ?? 0,
    lastRunAt,
    nextRunIn: "~60 seconds",
  });
});

export default router;
