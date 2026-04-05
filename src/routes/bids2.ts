import { Router, type IRouter, Request, Response } from "express";
import { db, bids2Table, markets2Table, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

/**
 * POST /bids2/place
 * Place a bet on Market2
 */
router.post("/bids2/place", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { marketId, betType, number, amount } = req.body;
    const userId = (req as any).user.id;

    // Validation
    if (!marketId || !betType || !number || !amount) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({ error: "Amount must be greater than 0" });
      return;
    }

    // Get market
    const market = await db.select().from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market2 not found" });
      return;
    }

    if (!market.isActive) {
      res.status(400).json({ error: "Market is currently inactive" });
      return;
    }

    // Validate bet type and number
    const validation = validateBet2(betType, number);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Get user wallet
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId))
      .then(r => r[0]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userBalance = parseFloat(user.walletBalance.toString());
    if (userBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Calculate multiplier
    const multiplier = getBet2Multiplier(betType);

    // Deduct amount from wallet
    await db.update(usersTable)
      .set({
        walletBalance: sql.raw(`wallet_balance - ${amount}`)
      })
      .where(eq(usersTable.id, userId));

    // Place bid
    const [bid] = await db.insert(bids2Table)
      .values({
        userId,
        marketId,
        marketName: market.name,
        betType,
        number,
        amount: amount.toString(),
        multiplier,
        closeTime: market.closeTime,
        status: "pending"
      })
      .returning();

    res.json({
      success: true,
      message: "Bid placed successfully",
      bid: {
        id: bid.id,
        marketName: market.name,
        betType,
        number,
        amount,
        multiplier,
        closingTime: market.closeTime,
        createdAt: bid.createdAt
      }
    });
  } catch (err) {
    console.error("[Bids2] Error placing bid:", err);
    res.status(500).json({ error: "Failed to place bid" });
  }
});

/**
 * POST /bids2 - Alias for /bids2/place (standard REST pattern)
 * Place a bet on Market2
 */
router.post("/bids2", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { marketId, betType, number, amount } = req.body;
    const userId = (req as any).user.id;

    // Validation
    if (!marketId || !betType || !number || !amount) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({ error: "Amount must be greater than 0" });
      return;
    }

    // Get market
    const market = await db.select().from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market2 not found" });
      return;
    }

    if (!market.isActive) {
      res.status(400).json({ error: "Market is currently inactive" });
      return;
    }

    // Validate bet type and number
    const validation = validateBet2(betType, number);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Get user wallet
    const user = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId))
      .then(r => r[0]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userBalance = parseFloat(user.walletBalance.toString());
    if (userBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Calculate multiplier
    const multiplier = getBet2Multiplier(betType);

    // Deduct amount from wallet
    await db.update(usersTable)
      .set({
        walletBalance: sql.raw(`wallet_balance - ${amount}`)
      })
      .where(eq(usersTable.id, userId));

    // Place bid
    const [bid] = await db.insert(bids2Table)
      .values({
        userId,
        marketId,
        marketName: market.name,
        betType,
        number,
        amount: amount.toString(),
        multiplier,
        closeTime: market.closeTime,
        status: "pending"
      })
      .returning();

    res.json({
      success: true,
      message: "Bid placed successfully",
      bid: {
        id: bid.id,
        marketName: market.name,
        betType,
        number,
        amount,
        multiplier,
        closingTime: market.closeTime,
        createdAt: bid.createdAt
      }
    });
  } catch (err) {
    console.error("[Bids2] Error placing bid:", err);
    res.status(500).json({ error: "Failed to place bid" });
  }
});

/**
 * GET /bids2
 * Get all bids2 for authenticated user
 */
router.get("/bids2", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const bids = await db.select().from(bids2Table)
      .where(eq(bids2Table.userId, userId))
      .then(rows => {
        const start = (page - 1) * limit;
        const end = start + limit;
        return rows.slice(start, end);
      });

    const total = await db.select().from(bids2Table)
      .where(eq(bids2Table.userId, userId))
      .then(r => r.length);

    const formattedBids = bids.map(b => ({
      id: b.id,
      marketName: b.marketName,
      betType: b.betType,
      number: b.number,
      amount: parseFloat(b.amount),
      multiplier: b.multiplier,
      closeTime: b.closeTime,
      status: b.status,
      winAmount: b.winAmount ? parseFloat(b.winAmount) : 0,
      createdAt: b.createdAt
    }));

    res.json({
      bids: formattedBids,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("[Bids2] Error fetching user bids:", err);
    res.status(500).json({ error: "Failed to fetch bids" });
  }
});

/**
 * GET /bids2/market/:marketId
 * Get all bids for a specific market2
 */
router.get("/bids2/market/:marketId", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const marketId = parseInt(req.params.marketId as string);

    const bids = await db.select().from(bids2Table)
      .where(eq(bids2Table.marketId, marketId));

    const formattedBids = bids.map(b => ({
      id: b.id,
      userId: b.userId,
      betType: b.betType,
      number: b.number,
      amount: parseFloat(b.amount),
      multiplier: b.multiplier,
      status: b.status,
      winAmount: b.winAmount ? parseFloat(b.winAmount) : 0
    }));

    res.json({
      marketId,
      totalBids: bids.length,
      bids: formattedBids
    });
  } catch (err) {
    console.error("[Bids2] Error fetching market bids:", err);
    res.status(500).json({ error: "Failed to fetch market bids" });
  }
});

// ============= Helper Functions =============

function validateBet2(betType: string, number: string): { valid: boolean; error?: string } {
  const validBetTypes = ["left_digit", "right_digit", "odd_even", "jodi"];

  if (!validBetTypes.includes(betType)) {
    return { valid: false, error: `Invalid bet type. Must be one of: ${validBetTypes.join(", ")}` };
  }

  switch (betType) {
    case "left_digit":
    case "right_digit":
      if (!/^\d$/.test(number) || parseInt(number) < 0 || parseInt(number) > 9) {
        return { valid: false, error: "Digit must be between 0-9" };
      }
      break;

    case "odd_even":
      if (!["odd", "even"].includes(number)) {
        return { valid: false, error: "Must be 'odd' or 'even'" };
      }
      break;

    case "jodi":
      if (!/^\d{2}$/.test(number)) {
        return { valid: false, error: "Jodi must be 2 digits (00-99)" };
      }
      break;
  }

  return { valid: true };
}

function getBet2Multiplier(betType: string): number {
  switch (betType) {
    case "left_digit":
    case "right_digit":
      return 9; // 9x for single digit
    case "odd_even":
      return 2; // 2x for odd/even (approximately 1.8x rounded up)
    case "jodi":
      return 90; // 90x for jodi
    default:
      return 1;
  }
}

export default router;
