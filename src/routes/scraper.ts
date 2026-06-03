import { Router, type IRouter } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import { format } from "date-fns";
import { db, marketsTable, scraperLogsTable, resultsTable } from "@workspace/db";
import { GetScraperLogsQueryParams, UpdateMarketAutoConfigParams, UpdateMarketAutoConfigBody, FetchMarketResultNowParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { fetchAndUpdateMarketResult } from "../lib/scraper.js";
import { getSchedulerStatus } from "../lib/scheduler.js";
import { getTodayDateIST } from "../lib/date-utils.js";

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
  console.log("[M1][LIVE] Request received", req.params);

  const params = FetchMarketResultNowParams.safeParse(req.params);
  if (!params.success) {
    console.error("[M1][LIVE] Invalid ID", params.error);
    res.status(400).json({ error: "Invalid ID", details: params.error });
    return;
  }

  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.id, params.data.id));

  if (!market) {
    console.error("[M1][LIVE] Market not found:", params.data.id);
    res.status(404).json({ error: "Market not found" });
    return;
  }

  try {
    const result = await fetchAndUpdateMarketResult(params.data.id);
    console.log("[M1][LIVE] Result status:", result.success ? "saved" : "not found", result.message);
    res.json(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[M1][LIVE] Exception:", errorMsg);
    res.status(500).json({ success: false, message: errorMsg, data: null });
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
