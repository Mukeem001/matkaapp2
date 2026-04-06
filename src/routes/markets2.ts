import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, markets2Table } from "@workspace/db";
import { CreateMarketBody, UpdateMarketParams, UpdateMarketBody, DeleteMarketParams, GetMarketByIdParams } from "@workspace/api-zod";
import { authMiddleware, userAuthMiddleware } from "../middlewares/auth.js";

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

export default router;

