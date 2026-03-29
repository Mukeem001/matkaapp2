import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import { format } from "date-fns";
import { db, bidsTable, usersTable, marketsTable, resultsTable, gameRatesTable } from "@workspace/db";
import { GetBidsQueryParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { processMarketBidsPreClose, isBidWinner, calculateWinnings } from "../lib/bid-processor.js";

const router: IRouter = Router();

// Helper function for date range calculation
function getDateRangeForType(type: string): { from: Date; to: Date } | null {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istNow = new Date(now.getTime() + istOffset);

  switch (type) {
    case "today":
      const todayStart = new Date(istNow);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(istNow);
      todayEnd.setUTCHours(23, 59, 59, 999);
      return { from: todayStart, to: todayEnd };

    case "yesterday":
      const yesterdayDate = new Date(istNow);
      yesterdayDate.setUTCDate(istNow.getUTCDate() - 1);
      const yesterdayStart = new Date(yesterdayDate);
      yesterdayStart.setUTCHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayDate);
      yesterdayEnd.setUTCHours(23, 59, 59, 999);
      return { from: yesterdayStart, to: yesterdayEnd };

    case "last3days":
      const last3End = new Date(istNow);
      last3End.setUTCHours(23, 59, 59, 999);
      const last3Start = new Date(istNow);
      last3Start.setUTCDate(istNow.getUTCDate() - 2);
      last3Start.setUTCHours(0, 0, 0, 0);
      return { from: last3Start, to: last3End };

    case "last7days":
      const last7End = new Date(istNow);
      last7End.setUTCHours(23, 59, 59, 999);
      const last7Start = new Date(istNow);
      last7Start.setUTCDate(istNow.getUTCDate() - 6);
      last7Start.setUTCHours(0, 0, 0, 0);
      return { from: last7Start, to: last7End };

    case "lastMonth":
      const lastMonthEnd = new Date(istNow);
      lastMonthEnd.setUTCHours(23, 59, 59, 999);
      const lastMonthStart = new Date(istNow);
      lastMonthStart.setUTCDate(1);
      lastMonthStart.setUTCHours(0, 0, 0, 0);
      return { from: lastMonthStart, to: lastMonthEnd };

    default:
      return null;
  }
}

router.get("/bids", authMiddleware, async (req, res): Promise<void> => {
  try {
    const query = GetBidsQueryParams.safeParse(req.query);
    const page = query.success ? (query.data.page ?? 1) : 1;
    const limit = query.success ? (query.data.limit ?? 20) : 20;
    const createdType = (req.query.createdType as string) || undefined;
    const createdAfter = (req.query.createdAfter as string) || undefined;
    const createdBefore = (req.query.createdBefore as string) || undefined;

    // Build date filter conditions
    let conditions = [];
    if (createdType && createdType !== "custom") {
      const range = getDateRangeForType(createdType);
      if (range) {
        conditions.push(gte(bidsTable.createdAt, range.from));
        conditions.push(lte(bidsTable.createdAt, range.to));
        console.log(`[Bids Filter] createdType: ${createdType}, custom: no, conditions: ${conditions.length}`);
      }
    } else if (createdAfter || createdBefore) {
      if (createdAfter) {
        conditions.push(gte(bidsTable.createdAt, new Date(createdAfter)));
      }
      if (createdBefore) {
        conditions.push(lte(bidsTable.createdAt, new Date(createdBefore)));
      }
      console.log(`[Bids Filter] custom dates, conditions: ${conditions.length}`);
    }

    // Build the query
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const bids = whereCondition
      ? await db.select().from(bidsTable).where(whereCondition).limit(limit)
      : await db.select().from(bidsTable).limit(limit);

    const totalResult = whereCondition
      ? await db.select({ count: sql`count(*)` }).from(bidsTable).where(whereCondition)
      : await db.select({ count: sql`count(*)` }).from(bidsTable);

    const total = typeof totalResult[0]?.count === 'bigint'
      ? Number(totalResult[0].count)
      : (totalResult[0]?.count || 0);

    console.log(`[Bids Filter] Found ${bids.length} bids`);

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
        digit: b.number,
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

/**
 * PATCH /bids/:id
 * Edit a pending bid - allows users to change amount and/or number
 * Only pending bids can be edited
 */
router.patch("/bids/:id", authMiddleware, async (req, res): Promise<void> => {
  console.log(`[DEBUG ARTIFACTS PATCH] Received PATCH request for /bids/:id with params:`, req.params);
  try {
    const bidId = parseInt(req.params.id as string, 10);
    const { amount, number, status } = req.body;

    if (isNaN(bidId)) {
      res.status(400).json({ error: "Invalid bid ID" });
      return;
    }

    // Get the bid
    const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, bidId));
    if (!bid) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    // Validate input
    const updates: any = {};
    if (amount !== undefined) {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }
      updates.amount = numAmount.toString();
    }
    if (number !== undefined) {
      if (typeof number !== 'string' || number.trim() === '') {
        res.status(400).json({ error: "Invalid number" });
        return;
      }
      updates.number = number.trim();
    }
    if (status !== undefined) {
      const validStatuses = ['pending', 'won', 'lost'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid updates provided" });
      return;
    }

    // Update the bid
    const [updatedBid] = await db.update(bidsTable)
      .set(updates)
      .where(eq(bidsTable.id, bidId))
      .returning();

    console.log(`[Edit Bid] Bid ${bidId} updated:`, updates);

    res.json({
      id: updatedBid.id,
      userId: updatedBid.userId,
      marketId: updatedBid.marketId,
      marketName: updatedBid.marketName || "Unknown",
      gameType: updatedBid.gameType,
      amount: typeof updatedBid.amount === 'string' ? parseFloat(updatedBid.amount) : updatedBid.amount,
      number: updatedBid.number,
      openTime: updatedBid.openTime || "",
      closeTime: updatedBid.closeTime || "",
      status: updatedBid.status,
      createdAt: typeof updatedBid.createdAt === 'string' ? updatedBid.createdAt : (updatedBid.createdAt?.toISOString?.() ?? new Date().toISOString()),
    });
  } catch (err) {
    console.error("[Edit Bid] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
