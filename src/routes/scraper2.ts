import { Router, type IRouter } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import { db, markets2Table, results2Table, scraperLogsTable } from "@workspace/db";
import { GetScraperLogsQueryParams, UpdateMarketAutoConfigParams, UpdateMarketAutoConfigBody, FetchMarketResultNowParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { scrapeLiveResults } from "../lib/scraper.js";
import { fetchAndUpdateMarkets2Result } from "../lib/scraper2.js";
import { getSchedulerStatus } from "../lib/scheduler.js";

const router: IRouter = Router();

const formatMarkets2 = (m: typeof markets2Table.$inferSelect) => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
  lastFetchedAt: m.lastFetchedAt?.toISOString() ?? null,
});

// Debug route
router.get("/debug-markets2", (_req, res): void => {
  res.json({ message: "Markets2 scraper routes working", timestamp: new Date().toISOString() });
});

router.put("/markets2/:id/auto-config", authMiddleware, async (req, res): Promise<void> => {
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

  const result = await db.update(markets2Table).set({
    autoUpdate: body.data.autoUpdate,
    sourceUrl: body.data.sourceUrl ?? null,
  }).where(eq(markets2Table.id, params.data.id)).returning();

  const market = result[0];
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }

  res.json(formatMarkets2(market));
});

router.post("/markets2/:id/fetch-now", async (req, res): Promise<void> => {
  const params = FetchMarketResultNowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    // Determine if caller requested proxy for this fetch
    const queryUseProxy = String(req.query.useProxy ?? '').toLowerCase();
    const bodyUseProxy = req.body && (req.body.useProxy === true || String(req.body.useProxy).toLowerCase() === 'true');
    const useProxy = queryUseProxy === '1' || queryUseProxy === 'true' || bodyUseProxy;

    const result = await fetchAndUpdateMarkets2Result(params.data.id, { forceProxy: useProxy });
    res.json(result);
  } catch (error) {
    console.error("Error fetching market2 now:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch market results",
      data: null 
    });
  }
});

router.get("/markets2/:id/live-results", async (req, res): Promise<void> => {
  console.log("[M2][LIVE] Request received", req.params);

  const params = FetchMarketResultNowParams.safeParse(req.params);
  if (!params.success) {
    console.error("[M2][LIVE] Invalid ID", params.error);
    res.status(400).json({ error: "Invalid ID", details: params.error });
    return;
  }

  const result = await db
    .select()
    .from(markets2Table)
    .where(eq(markets2Table.id, params.data.id));

  const market = result[0];
  if (!market) {
    console.error("[M2][LIVE] Market not found:", params.data.id);
    res.status(404).json({ error: "Market not found" });
    return;
  }

  try {
    const liveResult = await scrapeLiveResults(market.name);
    const hasAnyResult = liveResult.openResult || liveResult.jodiResult || liveResult.closeResult;

    if (!hasAnyResult) {
      console.log("[M2][LIVE] No live result found for", market.name);
      res.json({ success: false, message: "No live results available", data: null });
      return;
    }

    console.log("[M2][LIVE] Live result found for", market.name, liveResult);

    try {
      const marketUpdateData: any = {
        lastFetchedAt: new Date(),
      };
      if (liveResult.openResult) marketUpdateData.openResult = liveResult.openResult;
      if (liveResult.jodiResult) marketUpdateData.jodiResult = liveResult.jodiResult;
      if (liveResult.closeResult) marketUpdateData.closeResult = liveResult.closeResult;

      await db.update(markets2Table).set(marketUpdateData).where(eq(markets2Table.id, params.data.id));
      await db.insert(scraperLogsTable).values({
        marketId: market.id,
        marketName: market.name,
        sourceUrl: market.sourceUrl ?? "https://akingsatta.in/",
        success: true,
        openResult: liveResult.openResult,
        closeResult: liveResult.closeResult,
        jodiResult: liveResult.jodiResult,
      });

      res.json({ success: true, message: "Live results found and saved to database", data: liveResult });
    } catch (dbError) {
      console.error("[M2][LIVE] Database error:", dbError);
      res.status(500).json({ success: false, message: `Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`, data: null });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[M2][LIVE] Exception:", errorMsg);
    res.status(500).json({ success: false, message: errorMsg, data: null });
  }
});

router.get("/markets2/:id/results/:date", async (req, res): Promise<void> => {
  const marketId = parseInt(String(req.params.id), 10);
  const resultDate = req.params.date as string; // format: "yyyy-MM-dd"

  if (isNaN(marketId)) {
    res.status(400).json({ error: "Invalid market ID" });
    return;
  }

  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(resultDate)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  try {
    const market = await db.select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    const result = await db.select()
      .from(results2Table)
      .where(and(
        eq(results2Table.marketId, marketId),
        eq(results2Table.resultDate, resultDate)
      ))
      .then(r => r[0]);

    if (!result) {
      res.json({ success: false, message: "No results found for this date", data: null });
      return;
    }

    res.json({
      success: true,
      message: "Result found",
      data: {
        marketId,
        date: resultDate,
        result: result.result,
        fetchedAt: result.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching markets2 results:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
