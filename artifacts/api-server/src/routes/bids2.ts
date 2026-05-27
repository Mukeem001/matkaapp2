import { Router, type IRouter, Request, Response } from "express";
import { db, bids2Table, markets2Table, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { userAuthMiddleware, type AuthRequest } from "../../../../src/middlewares/auth.ts";



const router: IRouter = Router();

// ============= Helper Functions =============

/**
 * Normalize request body to support multiple payload formats
 * Supports:
 * 1. Old format: { marketId, betType, number, amount }
 * 2. New format: { amount, gameType, marketId, marketopenclose, number }
 */
function normalizePayload(body: any): {
  marketId: number;
  betType: string;
  number: string;
  amount: number;
  marketopenclose?: string;
} {
  // Already in expected format
  if (body.betType) {
    return {
      marketId: body.marketId,
      betType: body.betType,
      number: body.number,
      amount: body.amount,
      marketopenclose: body.marketopenclose
    };
  }

  // Convert new format to old format
  if (body.gameType) {
    let betType = "left_digit";
    
    // Map gameType to betType
    switch (body.gameType?.toLowerCase()) {
      case "single_digit":
      case "left_digit":
        betType = "left_digit";
        break;
      case "right_digit":
        betType = "right_digit";
        break;
      case "odd_even":
      case "odeven":
        betType = "odd_even";
        break;
      case "jodi":
        betType = "jodi";
        break;
      default:
        betType = "left_digit"; // default fallback
    }

    return {
      marketId: body.marketId,
      betType: betType,
      number: String(body.number),
      amount: body.amount,
      marketopenclose: body.marketopenclose
    };
  }

  // Return as-is if can't determine
  return {
    marketId: body.marketId,
    betType: body.betType || "left_digit",
    number: String(body.number),
    amount: body.amount,
    marketopenclose: body.marketopenclose
  };
}

function validateBet2(betType: string, number: string): { valid: boolean; error?: string } {
  const validBetTypes = ["left_digit", "right_digit", "odd_even", "jodi"];

  if (!validBetTypes.includes(betType)) {
    return { valid: false, error: `Invalid bet type. Must be one of: ${validBetTypes.join(", ")}` };
  }

  switch (betType) {
    case "left_digit":
    case "right_digit":
      // Support both single digit and comma-separated
      if (number.includes(",")) {
        // Multiple digits: "0,2,4,6,8"
        const digits = number.split(",").map(d => d.trim());
        for (const digit of digits) {
          if (!/^\d$/.test(digit) || parseInt(digit) < 0 || parseInt(digit) > 9) {
            return { valid: false, error: "Each digit must be between 0-9" };
          }
        }
      } else {
        // Single digit
        if (!/^\d$/.test(number) || parseInt(number) < 0 || parseInt(number) > 9) {
          return { valid: false, error: "Digit must be between 0-9" };
        }
      }
      break;

    case "odd_even":
      // Support: "odd", "even" or comma-separated digits "0,2,4,6,8" or "1,3,5,7,9"
      if (number.includes(",")) {
        // Multiple digits format: "0,2,4,6,8"
        const digits = number.split(",").map(d => d.trim());
        // Verify all are single digits and validate odd/even pattern
        const allDigits = digits.every(d => /^\d$/.test(d) && parseInt(d) >= 0 && parseInt(d) <= 9);
        if (!allDigits) {
          return { valid: false, error: "Each digit must be between 0-9" };
        }
        // Optional: Verify they're all odd or all even
        const digitValues = digits.map(d => parseInt(d));
        const allOdd = digitValues.every(d => d % 2 === 1);
        const allEven = digitValues.every(d => d % 2 === 0);
        if (!allOdd && !allEven) {
          return { valid: false, error: "Digits must be all odd (1,3,5,7,9) or all even (0,2,4,6,8)" };
        }
      } else {
        // Single value format: "odd" or "even"
        if (!["odd", "even"].includes(number.toLowerCase())) {
          return { valid: false, error: "Must be 'odd', 'even' or comma-separated digits (0,2,4,6,8 or 1,3,5,7,9)" };
        }
      }
      break;

    case "jodi":
      // Support both single jodi and comma-separated
      if (number.includes(",")) {
        // Multiple jodie: "25,75,50,00"
        const jodie = number.split(",").map(j => j.trim());
        for (const j of jodie) {
          if (!/^\d{2}$/.test(j)) {
            return { valid: false, error: "Each jodi must be 2 digits (00-99)" };
          }
        }
      } else {
        // Single jodi
        if (!/^\d{2}$/.test(number)) {
          return { valid: false, error: "Jodi must be 2 digits (00-99) or comma-separated jodie (25,75,50,00)" };
        }
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
      return 2; // 2x for odd/even
    case "jodi":
      return 90; // 90x for jodi
    default:
      return 1;
  }
}

// ============= API Routes =============

/**
 * POST /bids2 - Place a new bid on Market2
 * Accepts multiple payload formats:
 * 1. { marketId, betType, number, amount }
 * 2. { amount, gameType, marketId, marketopenclose, number } (mobile format)
 * Returns: { success, message, bid }
 */
router.post("/bids2", userAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Normalize payload to support both formats
    const normalized = normalizePayload(req.body);
    const { marketId, betType, number, amount, marketopenclose } = normalized;
    const userId = req.userId;

    // Validation
    if (!marketId || !betType || !number || !amount) {
      res.status(400).json({ 
        error: "Missing required fields",
        accepted_formats: [
          { marketId: "number", betType: "string", number: "string", amount: "number" },
          { marketId: "number", gameType: "string (single_digit|odd_even|jodi)", number: "string", amount: "number", marketopenclose: "string" }
        ]
      });
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: "Amount must be a positive number" });
      return;
    }

    // Get market
    const market = await db.select().from(markets2Table)
      .where(eq(markets2Table.id, marketId))
      .then(r => r[0]);

    if (!market) {
      res.status(404).json({ error: "Market not found" });
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
      res.status(400).json({ error: `Insufficient balance. Required: ${amount}, Available: ${userBalance}` });
      return;
    }

    // Calculate multiplier
    const multiplier = getBet2Multiplier(betType);

    // Deduct amount from wallet
    await db.update(usersTable)
      .set({
        walletBalance: sql`wallet_balance - ${amount}`
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

    res.status(201).json({
      success: true,
      message: "Bid placed successfully",
      bid: {
        id: bid.id,
        marketId: bid.marketId,
        marketName: bid.marketName,
        betType: bid.betType,
        number: bid.number,
        amount: parseFloat(bid.amount),
        multiplier: bid.multiplier,
        closeTime: bid.closeTime,
        status: bid.status,
        createdAt: bid.createdAt
      }
    });
  } catch (err) {
    console.error("[Bids2] Error placing bid:", err);
    res.status(500).json({ error: "Failed to place bid", details: err instanceof Error ? err.message : "Unknown error" });
  }
});


/**
 * GET /bids2 - Get all bids for authenticated user (with pagination)
 * Query params: page (default: 1), limit (default: 20)
 * Returns: { bids: [], total, page, limit, totalPages }
 */
router.get("/bids2", userAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    const allBids = await db.select().from(bids2Table)
      .where(eq(bids2Table.userId, userId));

    const total = allBids.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const bids = allBids.slice(start, end);

    const formattedBids = bids.map(b => ({
      id: b.id,
      marketId: b.marketId,
      marketName: b.marketName,
      betType: b.betType,
      number: b.number,
      amount: parseFloat(b.amount),
      multiplier: b.multiplier,
      status: b.status,
      winAmount: b.winAmount ? parseFloat(b.winAmount) : 0,
      closeTime: b.closeTime,
      createdAt: b.createdAt
    }));

    res.json({
      success: true,
      bids: formattedBids,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("[Bids2] Error fetching user bids:", err);
    res.status(500).json({ error: "Failed to fetch bids", details: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * GET /bids2/:bidId - Get a specific bid by ID
 * Returns: { bid }
 */
router.get("/bids2/:bidId", userAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bidId = parseInt(req.params.bidId as string);
    const userId = req.userId;

    if (isNaN(bidId)) {
      res.status(400).json({ error: "Invalid bid ID" });
      return;
    }

    const bid = await db.select().from(bids2Table)
      .where(eq(bids2Table.id, bidId))
      .then(r => r[0]);

    if (!bid) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    if (bid.userId !== userId) {
      res.status(403).json({ error: "Unauthorized: Can only view your own bids" });
      return;
    }

    res.json({
      success: true,
      bid: {
        id: bid.id,
        marketId: bid.marketId,
        marketName: bid.marketName,
        betType: bid.betType,
        number: bid.number,
        amount: parseFloat(bid.amount),
        multiplier: bid.multiplier,
        status: bid.status,
        winAmount: bid.winAmount ? parseFloat(bid.winAmount) : 0,
        closeTime: bid.closeTime,
        createdAt: bid.createdAt
      }
    });
  } catch (err) {
    console.error("[Bids2] Error fetching bid:", err);
    res.status(500).json({ error: "Failed to fetch bid", details: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * GET /bids2/market/:marketId - Get all bids for a specific market
 * Query params: page (default: 1), limit (default: 20)
 * Returns: { marketId, bids: [], total, totalPages }
 */
router.get("/bids2/market/:marketId", userAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const marketId = parseInt(req.params.marketId as string);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));

    if (isNaN(marketId)) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }

    const allBids = await db.select().from(bids2Table)
      .where(eq(bids2Table.marketId, marketId));

    const total = allBids.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const bids = allBids.slice(start, end);

    const formattedBids = bids.map(b => ({
      id: b.id,
      userId: b.userId,
      betType: b.betType,
      number: b.number,
      amount: parseFloat(b.amount),
      multiplier: b.multiplier,
      status: b.status,
      winAmount: b.winAmount ? parseFloat(b.winAmount) : 0,
      createdAt: b.createdAt
    }));

    res.json({
      success: true,
      marketId,
      bids: formattedBids,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("[Bids2] Error fetching market bids:", err);
    res.status(500).json({ error: "Failed to fetch market bids", details: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * GET /bids2/status/:status - Get all bids with a specific status
 * Query params: page (default: 1), limit (default: 20)
 * Returns: { status, bids: [], total, totalPages }
 */
router.get("/bids2/status/:status", userAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const status = (req.params.status as string).toLowerCase();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    const validStatuses = ["pending", "won", "lost"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const allBids = await db.select().from(bids2Table)
      .where(eq(bids2Table.userId, userId));

    // Filter by status client-side (since we need case-insensitive comparison)
    const filteredBids = allBids.filter(b => b.status?.toLowerCase() === status);

    const total = filteredBids.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const bids = filteredBids.slice(start, end);

    const formattedBids = bids.map(b => ({
      id: b.id,
      marketId: b.marketId,
      marketName: b.marketName,
      betType: b.betType,
      number: b.number,
      amount: parseFloat(b.amount),
      multiplier: b.multiplier,
      status: b.status,
      winAmount: b.winAmount ? parseFloat(b.winAmount) : 0,
      closeTime: b.closeTime,
      createdAt: b.createdAt
    }));

    res.json({
      success: true,
      status,
      bids: formattedBids,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("[Bids2] Error fetching bids by status:", err);
    res.status(500).json({ error: "Failed to fetch bids", details: err instanceof Error ? err.message : "Unknown error" });
  }
});



export default router;
