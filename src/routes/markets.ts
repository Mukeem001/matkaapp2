import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, marketsTable, bidsTable, resultsTable, scraperLogsTable } from "@workspace/db";
import { CreateMarketBody, UpdateMarketParams, UpdateMarketBody, DeleteMarketParams, GetMarketByIdParams } from "@workspace/api-zod";
import { authMiddleware, userAuthMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

const formatMarket = (m: typeof marketsTable.$inferSelect) => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
  lastFetchedAt: m.lastFetchedAt?.toISOString() ?? null,
});

router.get("/markets",async (_req, res): Promise<void> => {
  try {
    const markets = await db.select().from(marketsTable);
    res.json(markets.map(formatMarket));
  } catch (error: any) {
    console.error("Get markets error:", error);
    res.status(500).json({ error: "Internal server error", details: error?.message });
  }
});

router.post("/markets", authMiddleware, async (req, res): Promise<void> => {
  const body = CreateMarketBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [market] = await db.insert(marketsTable).values({ name: body.data.name ?? "", openTime: body.data.openTime ?? "", closeTime: body.data.closeTime ?? "", isActive: body.data.isActive ?? true }).returning();
  res.status(201).json(formatMarket(market));
});

router.get("/markets/:id", userAuthMiddleware, async (req, res): Promise<void> => {
  const params = GetMarketByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, params.data.id));
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }
  res.json(formatMarket(market));
});

router.put("/markets/:id", authMiddleware, async (req, res): Promise<void> => {
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
  
  const [market] = await db.update(marketsTable).set(updateData).where(eq(marketsTable.id, params.data.id)).returning();
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }
  res.json(formatMarket(market));
});

router.delete("/markets/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = DeleteMarketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    // First check if market exists
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, params.data.id));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    console.log(`Deleting market ${params.data.id} (${market.name})`);

    // Use a transaction to defer foreign key constraints
    await db.transaction(async (tx) => {
      // Defer foreign key constraints
      await tx.execute('SET CONSTRAINTS ALL DEFERRED');

      // Delete related records
      await tx.delete(scraperLogsTable).where(eq(scraperLogsTable.marketId, params.data.id));
      await tx.delete(resultsTable).where(eq(resultsTable.marketId, params.data.id));
      await tx.delete(bidsTable).where(eq(bidsTable.marketId, params.data.id));

      // Now delete the market
      await tx.delete(marketsTable).where(eq(marketsTable.id, params.data.id));
    });

    res.json({ success: true, message: "Market deleted successfully" });
  } catch (error) {
    console.error("Error deleting market:", error);
    res.status(500).json({ error: "Failed to delete market due to related records" });
  }
});

router.get("/markets/:id/chart", async (req, res): Promise<void> => {
  const params = GetMarketByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    // Verify market exists
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, params.data.id));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Get today's date in IST (UTC+5:30) in YYYY-MM-DD format
    const now = new Date();
    // IST is UTC+5:30
    const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Get all results for this market except today's, sorted by date
    const results = await db
      .select()
      .from(resultsTable)
      .where(eq(resultsTable.marketId, params.data.id))
      .orderBy(resultsTable.resultDate);

    // Filter out today's results and format for chart
    const chartData = results
      .filter((result) => result.resultDate !== today)
      .map((result) => ({
        date: result.resultDate,
        open: result.openResult,
        jodi: result.jodiResult,
        close: result.closeResult,
      }));

    res.json({
      market: formatMarket(market),
      chartData,
    });
  } catch (error: any) {
    console.error("Get market chart error:", error);
    res.status(500).json({ error: "Internal server error", details: error?.message });
  }
});

export default router;

