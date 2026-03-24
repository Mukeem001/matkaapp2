import { Router, type IRouter } from "express";
import { sql, eq, and } from "drizzle-orm";
import { format } from "date-fns";
import { db, bidsTable, usersTable, marketsTable, resultsTable, gameRatesTable } from "@workspace/db";
import { GetBidsQueryParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { processMarketBidsPreClose, isBidWinner, calculateWinnings } from "../lib/bid-processor.js";

const router: IRouter = Router();

router.get("/bids", authMiddleware, async (req, res): Promise<void> => {
  try {
    const query = GetBidsQueryParams.safeParse(req.query);
    const page = query.success ? (query.data.page ?? 1) : 1;
    const limit = query.success ? (query.data.limit ?? 20) : 20;

    // Fetch bids using Drizzle ORM
    const bids = await db.select().from(bidsTable)
      .orderBy(sql`${bidsTable.createdAt} DESC`)
      .limit(limit)
      .catch(() => []);

    const totalResult = await db.select({ count: sql`count(*)` })
      .from(bidsTable)
      .catch(() => [{ count: 0 }]);

    const total = typeof totalResult[0]?.count === 'bigint' 
      ? Number(totalResult[0].count) 
      : (totalResult[0]?.count || 0);

    res.json({
      bids: bids.map((b: any) => ({
        id: b.id,
        userId: b.userId,
        userName: "User " + b.userId,
        marketId: b.marketId,
        marketName: b.marketName || "Unknown",
        gameType: b.gameType,
        amount: typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount,
        number: b.number,
        openTime: b.openTime || "",
        closeTime: b.closeTime || "",
        currentTime: typeof b.currentTime === 'string' ? b.currentTime : (b.currentTime?.toISOString?.() ?? new Date().toISOString()),
        status: b.status,
        createdAt: typeof b.createdAt === 'string' ? b.createdAt : (b.createdAt?.toISOString?.() ?? new Date().toISOString()),
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("[Bids] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/process-pre-close/:marketId
 * Process all pending bids for a market before closeTime - 20 minutes
 * Returns win/loss status and updates wallet for winners
 */
router.post("/process-pre-close/:marketId", authMiddleware, async (req, res): Promise<void> => {
  try {
    const marketId = parseInt(req.params.marketId as string, 10);

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    const result = await processMarketBidsPreClose(marketId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json({
      ...result,
      success: true,
    });
  } catch (err) {
    console.error("[Pre-Close Processing] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/process-now/:marketId
 * Force process all pending bids WITHOUT time restrictions (for testing/admin)
 */
router.post("/process-now/:marketId", authMiddleware, async (req, res): Promise<void> => {
  try {
    const marketId = parseInt(req.params.marketId as string, 10);

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    // Get market
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, marketId));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Get TODAY's result
    const today = format(new Date(), "yyyy-MM-dd");
    const [result] = await db.select().from(resultsTable).where(
      and(
        eq(resultsTable.marketId, marketId),
        eq(resultsTable.resultDate, today)
      )
    );

    if (!result || !result.openResult || !result.closeResult) {
      res.json({
        success: false,
        message: `No results found for ${market.name} on ${today}. Need openResult and closeResult.`,
      });
      return;
    }

    // Process bids WITHOUT time restrictions
    const marketResult = {
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult || undefined,
      pannaResult: result.pannaResult || undefined,
    };

    console.log(`[Force Process] ${market.name}: ${JSON.stringify(marketResult)}`);

    // Get game rates
    const [rates] = await db.select().from(gameRatesTable).limit(1);
    if (!rates) {
      res.json({ success: false, message: "Game rates not found" });
      return;
    }

    // Get all pending bids for this market
    const pendingBids = await db.select({
      id: bidsTable.id,
      userId: bidsTable.userId,
      gameType: bidsTable.gameType,
      amount: bidsTable.amount,
      number: bidsTable.number,
    })
      .from(bidsTable)
      .where(and(
        eq(bidsTable.marketId, marketId),
        eq(bidsTable.status, "pending")
      ));

    if (pendingBids.length === 0) {
      res.json({
        success: true,
        message: "No pending bids to process",
        processed: 0,
        won: 0,
        lost: 0,
      });
      return;
    }

    let wonCount = 0;
    let lostCount = 0;

    // Convert game rates from strings to numbers
    const gameRates = {
      singleDigit: parseFloat(rates.singleDigit as string),
      jodiDigit: parseFloat(rates.jodiDigit as string),
      singlePanna: parseFloat(rates.singlePanna as string),
      doublePanna: parseFloat(rates.doublePanna as string),
      triplePanna: parseFloat(rates.triplePanna as string),
      halfSangam: parseFloat(rates.halfSangam as string),
      fullSangam: parseFloat(rates.fullSangam as string),
    };

    // Process each bid
    for (const bid of pendingBids) {
      const bidAmount = parseFloat(bid.amount as string);
      const isWinner = isBidWinner(bid.number, bid.gameType, marketResult);

      if (isWinner) {
        const winnings = calculateWinnings(bidAmount, bid.gameType, gameRates);
        const totalWinnings = bidAmount + winnings;

        await db.transaction(async (tx) => {
          await tx.update(bidsTable)
            .set({ status: "won" })
            .where(eq(bidsTable.id, bid.id));

          await tx.update(usersTable)
            .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
            .where(eq(usersTable.id, bid.userId));
        });

        console.log(`[Force Process] Bid ${bid.id} WON: +₹${totalWinnings}`);
        wonCount++;
      } else {
        await db.update(bidsTable)
          .set({ status: "lost" })
          .where(eq(bidsTable.id, bid.id));

        console.log(`[Force Process] Bid ${bid.id} LOST`);
        lostCount++;
      }
    }

    res.json({
      success: true,
      message: `✅ Force processed ${pendingBids.length} bids for ${market.name}`,
      processed: pendingBids.length,
      won: wonCount,
      lost: lostCount,
    });
  } catch (err) {
    console.error("[Force Process] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
