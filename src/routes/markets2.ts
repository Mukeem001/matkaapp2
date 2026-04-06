import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, markets2Table, results2Table } from "@workspace/db";
import { CreateMarketBody, UpdateMarketParams, UpdateMarketBody, DeleteMarketParams, GetMarketByIdParams } from "@workspace/api-zod";
import { authMiddleware, userAuthMiddleware } from "../middlewares/auth.js";
import { fetchAndUpdateMarkets2Result } from "../lib/scraper2.js";

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
    const result = await db.update(markets2Table).set(body.data).where(eq(markets2Table.id, params.data.id)).returning();
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
      res.status(404).json({ error: "Market not found" });
      return;
    }

    console.log(`Deleting markets2 ${params.data.id} (${market.name})`);

    // Delete the market
    await db.delete(markets2Table).where(eq(markets2Table.id, params.data.id));

    res.json({ success: true, message: "Market deleted successfully" });
  } catch (error) {
    console.error("Error deleting markets2:", error);
    res.status(500).json({ error: "Failed to delete market" });
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

    // Trigger the fetch
    const result = await fetchAndUpdateMarkets2Result(marketId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.status(400).json({
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

