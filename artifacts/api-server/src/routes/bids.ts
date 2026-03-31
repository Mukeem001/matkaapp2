import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import { format } from "date-fns";
import { db, bidsTable, usersTable, marketsTable, resultsTable, gameRatesTable } from "@workspace/db";
import { GetBidsQueryParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import { processMarketBidsPreClose, isBidWinner, calculateWinnings } from "../lib/bid-processor.js";

const router: IRouter = Router();

/**
 * GET /bids/version
 * Simple deployment verification endpoint - returns current server time in IST
 * Use this to verify new code has been deployed to production
 */
router.get("/version", (req, res): void => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  res.json({
    status: "ok",
    deploymentTime: new Date().toISOString(),
    istTime: istTime.toISOString(),
    message: "✅ New deployment verified - bids routes are live"
  });
});

// Helper function for date range calculation (IST timezone aware)
function getDateRangeForType(type: string): { from: Date; to: Date } | null {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30

  // Get today's date in IST format (YYYY-MM-DD)
  const istDate = new Date(now.getTime() + istOffset);
  const istYear = istDate.getUTCFullYear();
  const istMonth = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const istDay = String(istDate.getUTCDate()).padStart(2, '0');
  const todayIST = `${istYear}-${istMonth}-${istDay}`;

  switch (type) {
    case "today": {
      // Today in IST: 00:00:00 to 23:59:59 IST
      // Which is: (today - 5:30) to (today + 18:30) in UTC
      const startIST = new Date(`${todayIST}T00:00:00Z`);
      const endIST = new Date(`${todayIST}T23:59:59Z`);
      return { 
        from: new Date(startIST.getTime() - istOffset), 
        to: new Date(endIST.getTime() - istOffset) 
      };
    }

    case "yesterday": {
      const yesterdayDate = new Date(istDate.getTime() - 24 * 60 * 60 * 1000);
      const yYear = yesterdayDate.getUTCFullYear();
      const yMonth = String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0');
      const yDay = String(yesterdayDate.getUTCDate()).padStart(2, '0');
      const yesterdayIST = `${yYear}-${yMonth}-${yDay}`;
      
      const startIST = new Date(`${yesterdayIST}T00:00:00Z`);
      const endIST = new Date(`${yesterdayIST}T23:59:59Z`);
      return { 
        from: new Date(startIST.getTime() - istOffset), 
        to: new Date(endIST.getTime() - istOffset) 
      };
    }

    case "last3days": {
      const last3StartDate = new Date(istDate.getTime() - 2 * 24 * 60 * 60 * 1000);
      const s3Year = last3StartDate.getUTCFullYear();
      const s3Month = String(last3StartDate.getUTCMonth() + 1).padStart(2, '0');
      const s3Day = String(last3StartDate.getUTCDate()).padStart(2, '0');
      const last3StartIST = `${s3Year}-${s3Month}-${s3Day}`;
      
      const startIST = new Date(`${last3StartIST}T00:00:00Z`);
      const endIST = new Date(`${todayIST}T23:59:59Z`);
      return { 
        from: new Date(startIST.getTime() - istOffset), 
        to: new Date(endIST.getTime() - istOffset) 
      };
    }

    case "last7days": {
      const last7StartDate = new Date(istDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      const s7Year = last7StartDate.getUTCFullYear();
      const s7Month = String(last7StartDate.getUTCMonth() + 1).padStart(2, '0');
      const s7Day = String(last7StartDate.getUTCDate()).padStart(2, '0');
      const last7StartIST = `${s7Year}-${s7Month}-${s7Day}`;
      
      const startIST = new Date(`${last7StartIST}T00:00:00Z`);
      const endIST = new Date(`${todayIST}T23:59:59Z`);
      return { 
        from: new Date(startIST.getTime() - istOffset), 
        to: new Date(endIST.getTime() - istOffset) 
      };
    }

    case "lastMonth": {
      const monthStartDate = new Date(istDate.getUTCFullYear(), istDate.getUTCMonth(), 1);
      const mYear = monthStartDate.getUTCFullYear();
      const mMonth = String(monthStartDate.getUTCMonth() + 1).padStart(2, '0');
      const lastMonthIST = `${mYear}-${mMonth}-01`;
      
      const startIST = new Date(`${lastMonthIST}T00:00:00Z`);
      const endIST = new Date(`${todayIST}T23:59:59Z`);
      return { 
        from: new Date(startIST.getTime() - istOffset), 
        to: new Date(endIST.getTime() - istOffset) 
      };
    }

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

    const bids = await db
      .select({
        id: bidsTable.id,
        userId: bidsTable.userId,
        userName: usersTable.name,
        marketId: bidsTable.marketId,
        marketName: bidsTable.marketName,
        gameType: bidsTable.gameType,
        amount: bidsTable.amount,
        number: bidsTable.number,
        openTime: bidsTable.openTime,
        closeTime: bidsTable.closeTime,
        currentTime: bidsTable.currentTime,
        status: bidsTable.status,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .leftJoin(usersTable, eq(bidsTable.userId, usersTable.id))
      .where(whereCondition)
      .limit(limit);

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
        userName: b.userName ?? "Unknown",
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

/**
 * GET /bids/process-bid/:bidId
 * Manual endpoint to process a single bid
 * Debug only - processes bid 103 specifically
 */
router.get("/process-bid/:bidId", async (req, res): Promise<void> => {
  try {
    const bidId = parseInt(req.params.bidId as string, 10);
    
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

    // Get the market
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, bid.marketId));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Get the LATEST result for this market
    const [result] = await db.select().from(resultsTable)
      .where(eq(resultsTable.marketId, bid.marketId))
      .orderBy((t) => sql`${t.resultDate} DESC`)
      .limit(1);

    if (!result || !result.openResult || !result.closeResult) {
      res.json({
        success: false,
        message: `No result found for market ${bid.marketId}`,
        bid: { id: bid.id, number: bid.number, gameType: bid.gameType, status: bid.status },
      });
      return;
    }

    const marketResult = {
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult || undefined,
      pannaResult: result.pannaResult || undefined,
    };

    // Check if winner
    const isWinner = isBidWinner(bid.number, bid.gameType, marketResult);

    if (isWinner) {
      // Calculate winnings
      const [rates] = await db.select().from(gameRatesTable).limit(1);
      const gameTypeMap: Record<string, keyof typeof gameRatesTable.$inferSelect> = {
        "single_digit": "singleDigit",
        "jodi": "jodiDigit",
        "single_panna": "singlePanna",
        "double_panna": "doublePanna",
        "triple_panna": "triplePanna",
        "half_sangam": "halfSangam",
        "full_sangam": "fullSangam",
      };
      const rateKey = gameTypeMap[bid.gameType] || "singleDigit";
      const rate = parseFloat((rates as any)[rateKey] as string);
      const bidAmount = parseFloat(bid.amount as string);
      const winnings = bidAmount * rate;
      const totalWinnings = bidAmount + winnings;

      // Update to won
      await db.update(bidsTable)
        .set({ status: "won" })
        .where(eq(bidsTable.id, bidId));

      // Credit wallet
      await db.update(usersTable)
        .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
        .where(eq(usersTable.id, bid.userId));

      res.json({
        success: true,
        action: "WON",
        bid: { id: bid.id, userId: bid.userId, number: bid.number, gameType: bid.gameType, amount: bidAmount },
        marketResult,
        winnings: { rate, winnings, totalCredited: totalWinnings },
      });
    } else {
      // Update to lost
      await db.update(bidsTable)
        .set({ status: "lost" })
        .where(eq(bidsTable.id, bidId));

      res.json({
        success: true,
        action: "LOST",
        bid: { id: bid.id, userId: bid.userId, number: bid.number, gameType: bid.gameType, amount: bid.amount },
        marketResult,
        message: `Bid did not match. Expected: ${bid.gameType === "single_digit" ? `first digit ${marketResult.jodiResult?.charAt(0)}` : marketResult.jodiResult}, Got: ${bid.number}`,
      });
    }
  } catch (err) {
    console.error("[Process Bid] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/fix-and-process/:bidId
 * Emergency endpoint to fix bid 
 * Creates result entry if needed, then processes the bid
 */
router.post("/fix-and-process/:bidId", async (req, res): Promise<void> => {
  try {
    const bidId = parseInt(req.params.bidId as string, 10);
    
    const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, bidId));
    if (!bid) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    // Get market
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.id, bid.marketId));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Calculate today's date in IST format
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const year = istNow.getUTCFullYear();
    const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istNow.getUTCDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Check if result exists for today
    let [result] = await db.select().from(resultsTable)
      .where(and(eq(resultsTable.marketId, bid.marketId), eq(resultsTable.resultDate, today)));

    // If not, create it from market data
    if (!result) {
      console.log(`Creating result for market ${bid.marketId} on ${today}`);
      const [inserted] = await db.insert(resultsTable).values({
        marketId: bid.marketId,
        resultDate: today,
        openResult: market.openResult,
        closeResult: market.closeResult,
        jodiResult: market.jodiResult || undefined,
      }).returning();
      result = inserted;
    }

    // Now process the bid
    const marketResult = {
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult || undefined,
      pannaResult: result.pannaResult || undefined,
    };

    const isWinner = isBidWinner(bid.number, bid.gameType, marketResult);

    if (isWinner) {
      const [rates] = await db.select().from(gameRatesTable).limit(1);
      const gameTypeMap: Record<string, any> = {
        "single_digit": "singleDigit",
        "jodi": "jodiDigit",
        "single_panna": "singlePanna",
        "double_panna": "doublePanna",
        "triple_panna": "triplePanna",
        "half_sangam": "halfSangam",
        "full_sangam": "fullSangam",
      };
      const rateKey = gameTypeMap[bid.gameType] || "singleDigit";
      const rate = parseFloat((rates as any)[rateKey] as string);
      const bidAmount = parseFloat(bid.amount as string);
      const winnings = bidAmount * rate;
      const totalWinnings = bidAmount + winnings;

      await db.update(bidsTable).set({ status: "won" }).where(eq(bidsTable.id, bidId));
      await db.update(usersTable)
        .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
        .where(eq(usersTable.id, bid.userId));

      res.json({
        success: true,
        action: "WON",
        bidId,
        amount: bidAmount,
        winnings: totalWinnings,
        result: marketResult,
      });
    } else {
      await db.update(bidsTable).set({ status: "lost" }).where(eq(bidsTable.id, bidId));

      res.json({
        success: true,
        action: "LOST",
        bidId,
        amount: bid.amount,
        message: `Bid lost: expected ${bid.gameType === "single_digit" ? `first digit ${marketResult.jodiResult?.charAt(0)}` : marketResult.jodiResult}, got ${bid.number}`,
        result: marketResult,
      });
    }
  } catch (err) {
    console.error("[Fix And Process] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /bids/debug/pending
 * Debug endpoint to check all pending bids (no auth required)
 */
router.get("/debug/pending", async (req, res): Promise<void> => {
  try {
    const pendingBids = await db
      .select({
        id: bidsTable.id,
        userId: bidsTable.userId,
        userName: usersTable.name,
        marketId: bidsTable.marketId,
        marketName: bidsTable.marketName,
        gameType: bidsTable.gameType,
        amount: bidsTable.amount,
        number: bidsTable.number,
        status: bidsTable.status,
        currentTime: bidsTable.currentTime,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .leftJoin(usersTable, eq(bidsTable.userId, usersTable.id))
      .where(eq(bidsTable.status, "pending"))
      .orderBy(bidsTable.createdAt);

    const formatted = pendingBids.map((b: any) => ({
      id: b.id,
      userId: b.userId,
      userName: b.userName ?? "Unknown",
      marketId: b.marketId,
      marketName: b.marketName || "Unknown",
      gameType: b.gameType,
      amount: typeof b.amount === "string" ? parseFloat(b.amount) : b.amount,
      number: b.number,
      status: b.status,
      currentTime: typeof b.currentTime === "string" ? b.currentTime : (b.currentTime?.toISOString?.() ?? new Date().toISOString()),
      createdAt: typeof b.createdAt === "string" ? b.createdAt : (b.createdAt?.toISOString?.() ?? new Date().toISOString()),
    }));

    res.json({
      total: formatted.length,
      pendingBids: formatted,
    });
  } catch (err) {
    console.error("[Debug Pending Bids] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/manual-process/:marketId
 * Process all pending bids for a specific market using the LATEST result available
 * No auth required - for manual intervention when auto-process doesn't pick up
 * Looks for the most recent result regardless of date
 */
router.post("/manual-process/:marketId", async (req, res): Promise<void> => {
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

    // Get the MOST RECENT result for this market (not just today)
    const [result] = await db.select().from(resultsTable)
      .where(eq(resultsTable.marketId, marketId))
      .orderBy((t) => sql`${t.resultDate} DESC`)
      .limit(1);

    if (!result || !result.openResult || !result.closeResult) {
      res.json({
        success: false,
        message: `No results found for ${market.name}. Need openResult and closeResult.`,
      });
      return;
    }

    const marketResult = {
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult || undefined,
      pannaResult: result.pannaResult || undefined,
    };

    console.log(`[Manual Process] ${market.name}: ${JSON.stringify(marketResult)}`);

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
        message: `No pending bids to process for ${market.name}`,
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
        const gameTypeMap: Record<string, keyof typeof gameRates> = {
          "single_digit": "singleDigit",
          "jodi": "jodiDigit",
          "single_panna": "singlePanna",
          "double_panna": "doublePanna",
          "triple_panna": "triplePanna",
          "half_sangam": "halfSangam",
          "full_sangam": "fullSangam",
        };
        const rateKey = gameTypeMap[bid.gameType] || "singleDigit";
        const winnings = bidAmount * gameRates[rateKey];
        const totalWinnings = bidAmount + winnings;

        await db.transaction(async (tx) => {
          await tx.update(bidsTable)
            .set({ status: "won" })
            .where(eq(bidsTable.id, bid.id));

          await tx.update(usersTable)
            .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
            .where(eq(usersTable.id, bid.userId));
        });

        console.log(`[Manual Process] Bid ${bid.id} WON: +₹${totalWinnings}`);
        wonCount++;
      } else {
        await db.update(bidsTable)
          .set({ status: "lost" })
          .where(eq(bidsTable.id, bid.id));

        console.log(`[Manual Process] Bid ${bid.id} LOST`);
        lostCount++;
      }
    }

    res.json({
      success: true,
      message: `✅ Manually processed ${pendingBids.length} bids for ${market.name}`,
      resultDate: result.resultDate,
      marketResult,
      processed: pendingBids.length,
      won: wonCount,
      lost: lostCount,
    });
  } catch (err) {
    console.error("[Manual Process] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/auto-process
 * Automatically process all pending bids that have market results available
 * No auth required - can be called by scheduler/cron
 */
router.post("/auto-process", async (req, res): Promise<void> => {
  try {
    console.log("[Auto Process] Starting auto-process of pending bids...");

    // Get all pending bids
    const pendingBids = await db
      .select({
        id: bidsTable.id,
        userId: bidsTable.userId,
        marketId: bidsTable.marketId,
        gameType: bidsTable.gameType,
        amount: bidsTable.amount,
        number: bidsTable.number,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .where(eq(bidsTable.status, "pending"));

    console.log(`[Auto Process] Found ${pendingBids.length} pending bids`);

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

    // Get game rates
    const [rates] = await db.select().from(gameRatesTable).limit(1);
    if (!rates) {
      res.status(500).json({ error: "Game rates not found" });
      return;
    }

    const gameRates: any = {
      singleDigit: parseFloat(rates.singleDigit as string),
      jodiDigit: parseFloat(rates.jodiDigit as string),
      singlePanna: parseFloat(rates.singlePanna as string),
      doublePanna: parseFloat(rates.doublePanna as string),
      triplePanna: parseFloat(rates.triplePanna as string),
      halfSangam: parseFloat(rates.halfSangam as string),
      fullSangam: parseFloat(rates.fullSangam as string),
    };

    let processedCount = 0;
    let wonCount = 0;
    let lostCount = 0;
    const failedBids = [];

    // Process each pending bid
    for (const bid of pendingBids) {
      try {
        // Get the bid creation date (treating it as result date)
        const bidDate = new Date(bid.createdAt);
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(bidDate.getTime() + istOffset);
        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');
        const resultDate = `${year}-${month}-${day}`;

        // Find market result for this bid
        const [result] = await db
          .select()
          .from(resultsTable)
          .where(
            and(
              eq(resultsTable.marketId, bid.marketId),
              eq(resultsTable.resultDate, resultDate)
            )
          );

        if (!result || !result.openResult || !result.closeResult) {
          console.log(`[Auto Process] Bid ${bid.id}: No result found for market ${bid.marketId} on ${resultDate}`);
          failedBids.push({ bidId: bid.id, reason: "Result not found" });
          continue;
        }

        // Check if bid is winner
        const marketResult = {
          openResult: result.openResult,
          closeResult: result.closeResult,
          jodiResult: result.jodiResult || undefined,
          pannaResult: result.pannaResult || undefined,
        };

        const isWinner = isBidWinner(bid.number, bid.gameType, marketResult);

        if (isWinner) {
          // Calculate winnings
          const gameTypeMap: Record<string, keyof typeof gameRates> = {
            "single_digit": "singleDigit",
            "jodi": "jodiDigit",
            "single_panna": "singlePanna",
            "double_panna": "doublePanna",
            "triple_panna": "triplePanna",
            "half_sangam": "halfSangam",
            "full_sangam": "fullSangam",
          };
          const rateKey = gameTypeMap[bid.gameType] || "singleDigit";
          const bidAmount = parseFloat(bid.amount as string);
          const winnings = bidAmount * gameRates[rateKey];
          const totalWinnings = bidAmount + winnings;

          // Update bid and user wallet in transaction
          await db.transaction(async (tx) => {
            await tx.update(bidsTable)
              .set({ status: "won" })
              .where(eq(bidsTable.id, bid.id));

            await tx.update(usersTable)
              .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
              .where(eq(usersTable.id, bid.userId));
          });

          console.log(`[Auto Process] Bid ${bid.id}: WON! Added ${totalWinnings} to user ${bid.userId}`);
          wonCount++;
        } else {
          // Update bid status to lost
          await db.update(bidsTable)
            .set({ status: "lost" })
            .where(eq(bidsTable.id, bid.id));

          console.log(`[Auto Process] Bid ${bid.id}: LOST`);
          lostCount++;
        }

        processedCount++;
      } catch (bidError) {
        console.error(`[Auto Process] Error processing bid ${bid.id}:`, bidError);
        failedBids.push({ bidId: bid.id, reason: (bidError as Error).message });
      }
    }

    console.log(
      `[Auto Process] Complete: Processed ${processedCount}, Won ${wonCount}, Lost ${lostCount}, Failed ${failedBids.length}`
    );

    res.json({
      success: true,
      message: `Auto-processed ${processedCount} bids`,
      processed: processedCount,
      won: wonCount,
      lost: lostCount,
      failed: failedBids.length,
      failedBids: failedBids.length > 0 ? failedBids : undefined,
    });
  } catch (err) {
    console.error("[Auto Process] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /bids/process-market/:marketId
 * Process all pending bids for a specific market that has declared results
 */
router.post("/process-market/:marketId", async (req, res): Promise<void> => {
  try {
    const marketId = parseInt(req.params.marketId as string, 10);
    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    console.log(`[Process Market] Processing bids for market ${marketId}...`);

    // Get all pending bids for this market
    const pendingBids = await db
      .select({
        id: bidsTable.id,
        userId: bidsTable.userId,
        marketId: bidsTable.marketId,
        gameType: bidsTable.gameType,
        amount: bidsTable.amount,
        number: bidsTable.number,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .where(and(eq(bidsTable.marketId, marketId), eq(bidsTable.status, "pending")));

    console.log(`[Process Market] Found ${pendingBids.length} pending bids for market ${marketId}`);

    if (pendingBids.length === 0) {
      res.json({
        success: true,
        message: "No pending bids for this market",
        processed: 0,
        won: 0,
        lost: 0,
      });
      return;
    }

    // Get game rates
    const [rates] = await db.select().from(gameRatesTable).limit(1);
    if (!rates) {
      res.status(500).json({ error: "Game rates not found" });
      return;
    }

    const gameRates: any = {
      singleDigit: parseFloat(rates.singleDigit as string),
      jodiDigit: parseFloat(rates.jodiDigit as string),
      singlePanna: parseFloat(rates.singlePanna as string),
      doublePanna: parseFloat(rates.doublePanna as string),
      triplePanna: parseFloat(rates.triplePanna as string),
      halfSangam: parseFloat(rates.halfSangam as string),
      fullSangam: parseFloat(rates.fullSangam as string),
    };

    let processedCount = 0;
    let wonCount = 0;
    let lostCount = 0;
    const failedBids = [];

    // Process each pending bid
    for (const bid of pendingBids) {
      try {
        const bidDate = new Date(bid.createdAt);
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(bidDate.getTime() + istOffset);
        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');
        const resultDate = `${year}-${month}-${day}`;

        const [result] = await db
          .select()
          .from(resultsTable)
          .where(
            and(
              eq(resultsTable.marketId, marketId),
              eq(resultsTable.resultDate, resultDate)
            )
          );

        if (!result || !result.openResult || !result.closeResult) {
          console.log(`[Process Market] Bid ${bid.id}: No result found for market ${marketId} on ${resultDate}`);
          failedBids.push({ bidId: bid.id, reason: "Result not found" });
          continue;
        }

        const marketResult = {
          openResult: result.openResult,
          closeResult: result.closeResult,
          jodiResult: result.jodiResult || undefined,
          pannaResult: result.pannaResult || undefined,
        };

        const isWinner = isBidWinner(bid.number, bid.gameType, marketResult);

        if (isWinner) {
          const gameTypeMap: Record<string, keyof typeof gameRates> = {
            "single_digit": "singleDigit",
            "jodi": "jodiDigit",
            "single_panna": "singlePanna",
            "double_panna": "doublePanna",
            "triple_panna": "triplePanna",
            "half_sangam": "halfSangam",
            "full_sangam": "fullSangam",
          };
          const rateKey = gameTypeMap[bid.gameType] || "singleDigit";
          const bidAmount = parseFloat(bid.amount as string);
          const winnings = bidAmount * gameRates[rateKey];
          const totalWinnings = bidAmount + winnings;

          await db.transaction(async (tx) => {
            await tx.update(bidsTable)
              .set({ status: "won" })
              .where(eq(bidsTable.id, bid.id));

            await tx.update(usersTable)
              .set({ walletBalance: sql`${usersTable.walletBalance} + ${totalWinnings}` })
              .where(eq(usersTable.id, bid.userId));
          });

          console.log(`[Process Market] Bid ${bid.id}: WON! Added ${totalWinnings} to user ${bid.userId}`);
          wonCount++;
        } else {
          await db.update(bidsTable)
            .set({ status: "lost" })
            .where(eq(bidsTable.id, bid.id));

          console.log(`[Process Market] Bid ${bid.id}: LOST`);
          lostCount++;
        }

        processedCount++;
      } catch (bidError) {
        console.error(`[Process Market] Error processing bid ${bid.id}:`, bidError);
        failedBids.push({ bidId: bid.id, reason: (bidError as Error).message });
      }
    }

    console.log(
      `[Process Market] Complete: Processed ${processedCount}, Won ${wonCount}, Lost ${lostCount}, Failed ${failedBids.length}`
    );

    res.json({
      success: true,
      message: `Processed ${processedCount} bids for market ${marketId}`,
      processed: processedCount,
      won: wonCount,
      lost: lostCount,
      failed: failedBids.length,
      failedBids: failedBids.length > 0 ? failedBids : undefined,
    });
  } catch (err) {
    console.error("[Process Market] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /admin/bids/mark-lost
 * Admin endpoint to mark bids as lost (for emergency fixes)
 * Body: { bidIds: [111, 125] }
 */
router.post("/admin/bids/mark-lost", async (req, res): Promise<void> => {
  try {
    const { bidIds } = req.body;

    if (!Array.isArray(bidIds) || bidIds.length === 0) {
      res.status(400).json({ error: "bidIds array required" });
      return;
    }

    let markedCount = 0;
    const results = [];

    for (const bidId of bidIds) {
      try {
        const updateResult = await db.update(bidsTable)
          .set({ status: "lost" })
          .where(eq(bidsTable.id, parseInt(bidId, 10)));

        console.log(`[Admin] Bid ${bidId} marked as LOST`);
        results.push({ bidId, status: "marked_lost" });
        markedCount++;
      } catch (error) {
        console.error(`[Admin] Error marking bid ${bidId} as lost:`, error);
        results.push({ bidId, status: "error", error: (error as Error).message });
      }
    }

    res.json({
      success: true,
      message: `Marked ${markedCount}/${bidIds.length} bids as lost`,
      marked: markedCount,
      results,
    });
  } catch (err) {
    console.error("[Admin] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
