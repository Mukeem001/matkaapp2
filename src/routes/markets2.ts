import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, markets2Table, results2Table, bids2Table } from "@workspace/db";
import { CreateMarketBody, UpdateMarketParams, UpdateMarketBody, DeleteMarketParams, GetMarketByIdParams } from "@workspace/api-zod";
import { authMiddleware, userAuthMiddleware } from "../middlewares/auth.js";
import { fetchAndUpdateMarkets2Result } from "../lib/scraper2.js";
import { getTodayDateIST, getYesterdayDateIST } from "../lib/date-utils.js";

const router: IRouter = Router();

const formatMarkets2 = (m: typeof markets2Table.$inferSelect) => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
  lastFetchedAt: m.lastFetchedAt?.toISOString() ?? null,
});

router.get("/markets2", async (_req, res): Promise<void> => {
  try {
    const markets = await db.select().from(markets2Table);
    res.json(markets.map(formatMarkets2));
  } catch (error) {
    console.error("Error fetching markets2:", error);
    res.status(500).json({ error: "Failed to fetch markets" });
  }
});

router.post("/markets2", authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = CreateMarketBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const result = await db.insert(markets2Table).values({ name: body.data.name ?? "", openTime: body.data.openTime ?? "", closeTime: body.data.closeTime ?? "", isActive: body.data.isActive ?? true }).returning();
    const market = result[0];
    res.status(201).json(formatMarkets2(market));
  } catch (error) {
    console.error("Error creating market2:", error);
    res.status(500).json({ error: "Failed to create market" });
  }
});

router.get("/markets2/:id", userAuthMiddleware, async (req, res): Promise<void> => {
  try {
    const params = GetMarketByIdParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const result = await db.select().from(markets2Table).where(eq(markets2Table.id, params.data.id));
    const market = result[0];
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json(formatMarkets2(market));
  } catch (error) {
    console.error("Error fetching market2:", error);
    res.status(500).json({ error: "Failed to fetch market" });
  }
});

router.put("/markets2/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const params = UpdateMarketParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const body = UpdateMarketBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    
    // Filter out undefined fields for partial updates
    const updateData = Object.fromEntries(
      Object.entries(body.data).filter(([, value]) => value !== undefined)
    );
    
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    
    const result = await db.update(markets2Table).set(updateData).where(eq(markets2Table.id, params.data.id)).returning();
    const market = result[0];
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json(formatMarkets2(market));
  } catch (error) {
    console.error("Error updating market2:", error);
    res.status(500).json({ error: "Failed to update market" });
  }
});

router.delete("/markets2/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = DeleteMarketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    // First check if market exists
    const result = await db.select().from(markets2Table).where(eq(markets2Table.id, params.data.id));
    const market = result[0];
    if (!market) {
      console.log(`[Markets2 Delete] Market ${params.data.id} not found`);
      res.status(404).json({ error: "Market not found" });
      return;
    }

    console.log(`[Markets2 Delete] Starting delete for market ${params.data.id} (${market.name})`);

    // Delete in correct order due to foreign key constraints:
    // 1. Delete bids first
    console.log(`[Markets2 Delete] Deleting bids for market ${params.data.id}`);
    await db.delete(bids2Table).where(eq(bids2Table.marketId, params.data.id));

    // 2. Delete results
    console.log(`[Markets2 Delete] Deleting results for market ${params.data.id}`);
    await db.delete(results2Table).where(eq(results2Table.marketId, params.data.id));

    // 3. Finally delete the market
    console.log(`[Markets2 Delete] Deleting market ${params.data.id} from markets2_table`);
    await db.delete(markets2Table).where(eq(markets2Table.id, params.data.id));

    console.log(`[Markets2 Delete] ✅ Market ${params.data.id} (${market.name}) deleted successfully`);
    res.json({ success: true, message: "Market deleted successfully" });
  } catch (error) {
    console.error("[Markets2 Delete] Error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to delete market: ${errorMsg}` });
  }
});

/**
 * Get results for a specific market on a specific date
 * GET /api/markets2/:id/results/:date
 * Example: GET /api/markets2/10/results/2024-04-07
 */
router.get("/markets2/:id/results/:date", async (req, res): Promise<void> => {
  try {
    const { id, date } = req.params;
    const marketId = parseInt(id, 10);

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      return;
    }

    // Check if market exists
    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Get result for the specified date
    const result = await db
      .select()
      .from(results2Table)
      .where(and(
        eq(results2Table.marketId, marketId),
        eq(results2Table.resultDate, date)
      ))
      .then(r => r[0]);

    if (!result) {
      // Return null/empty if no result found for that date
      res.json({ result: null, date, marketId });
      return;
    }

    res.json({
      result: result.result,
      date,
      marketId,
      fetchedAt: result.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching market2 results by date:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

/**
 * Get both TODAY'S and YESTERDAY'S results for a market
 * GET /api/markets2/:id/results-both-days
 * Example: GET /api/markets2/10/results-both-days
 */
router.get("/markets2/:id/results-both-days", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const marketId = parseInt(id, 10);

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    // Check if market exists
    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Get today's and yesterday's dates
    const today = getTodayDateIST();
    const yesterday = getYesterdayDateIST();

    // Get results for both days
    const results = await db
      .select()
      .from(results2Table)
      .where(and(
        eq(results2Table.marketId, marketId),
      ));

    // Separate today and yesterday
    const todayResult = results.find(r => r.resultDate === today);
    const yesterdayResult = results.find(r => r.resultDate === yesterday);

    res.json({
      marketId,
      today: {
        date: today,
        result: todayResult?.result || null,
      },
      yesterday: {
        date: yesterday,
        result: yesterdayResult?.result || null,
      }
    });
  } catch (error) {
    console.error("Error fetching market2 results for both days:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

/**
 * Manually trigger a fetch for a specific market
 * POST /api/markets2/:id/fetch-now
 * Example: POST /api/markets2/10/fetch-now
 */
router.post("/markets2/:id/fetch-now", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const marketId = parseInt(id, 10);

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    // Check if market exists
    const market = await db
      .select()
      .from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Determine if caller requested proxy for this fetch
    const queryUseProxy = String(req.query.useProxy ?? '').toLowerCase();
    const bodyUseProxy = req.body && (req.body.useProxy === true || String(req.body.useProxy).toLowerCase() === 'true');
    const useProxy = queryUseProxy === '1' || queryUseProxy === 'true' || bodyUseProxy;

    // Trigger the fetch (no sourceUrl check needed - scraper2 uses market names directly)
    const result = await fetchAndUpdateMarkets2Result(marketId, { forceProxy: useProxy });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      // Return 500 for scraper/server errors, not 400
      res.status(500).json({
        success: false,
        message: result.message,
        data: result.data,
      });
    }
  } catch (error) {
    console.error("Error fetching market2 now:", error);
    res.status(500).json({
      success: false,
      message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

export default router;

