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

    // Use sql() helper for raw SQL with drizzle
    const bidsResult = await db.execute(sql`
      SELECT 
        id, user_id, market_id, market_name, game_type, amount, number, 
        open_time, close_time, current_time, status, created_at
      FROM bids 
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as any;

    const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM bids`) as any;

    const bids = (bidsResult.rows || []).map((b: any) => ({
      id: b.id,
      userId: b.user_id,
      userName: "User " + b.user_id,
      marketId: b.market_id,
      marketName: b.market_name || "Unknown",
      gameType: b.game_type,
      amount: parseFloat(b.amount || "0"),
      number: b.number,
      openTime: b.open_time || "",
      closeTime: b.close_time || "",
      currentTime: typeof b.current_time === 'string' ? b.current_time : (b.current_time?.toISOString?.() ?? new Date().toISOString()),
      status: b.status,
      createdAt: typeof b.created_at === 'string' ? b.created_at : (b.created_at?.toISOString?.() ?? new Date().toISOString()),
    }));

    res.json({
      bids,
      total: parseInt((totalResult.rows?.[0]?.count || 0) as string),
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

/**
 * PATCH /bids/:id
 * Edit a pending bid - allows users to change amount and/or number
 * Only pending bids can be edited
 */
router.patch("/bids/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const bidId = parseInt(req.params.id as string, 10);
    const { amount, number } = req.body;

    if (isNaN(bidId)) {
      res.status(400).json({ error: "Invalid bid ID" });
      return;
    }

    const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, bidId));
    if (!bid) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    if (bid.status !== "pending") {
      res.status(400).json({ error: `Cannot edit ${bid.status} bid` });
      return;
    }

    // Validate and prepare updates
    const updates: any = {};
    
    if (amount !== undefined) {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ error: "Invalid amount - must be greater than 0" });
        return;
      }
      updates.amount = numAmount.toString();
    }
    
    if (number !== undefined) {
      if (typeof number !== 'string' || number.trim() === '') {
        res.status(400).json({ error: "Invalid number - must be non-empty string" });
        return;
      }
      updates.number = number.trim();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Update bid
    const [updatedBid] = await db.update(bidsTable)
      .set(updates)
      .where(eq(bidsTable.id, bidId))
      .returning();

    console.log(`[Edit Bid] Bid ${bidId} updated:`, updates);
    
    res.json({
      ...updatedBid,
      amount: parseFloat(updatedBid.amount as string),
    });
  } catch (err) {
    console.error("[Edit Bid] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
