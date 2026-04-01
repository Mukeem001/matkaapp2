import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, marketsTable, markets2Table, bidsTable, depositsTable, withdrawalsTable, resultsTable, noticesTable, upiMethodsTable, apkFilesTable } from "@workspace/db";
import { userAuthMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

// Helper function to validate bid numbers based on game type
function isValidBidNumber(gameType: string, number: string): boolean {
  switch (gameType) {
    case "single_digit":
      return /^\d{1}$/.test(number); // 1 digit
    case "jodi":
      return /^\d{2}$/.test(number); // 2 digits
    case "single_panna":
    case "double_panna":
    case "triple_panna":
      return /^\d{3}$/.test(number); // 3 digits
    case "half_sangam":
      return /^\d{3}$/.test(number); // 3 digits
    case "full_sangam":
      return /^\d{6}$/.test(number); // 6 digits (3+3)
    default:
      return false;
  }
}

// Helper function to get valid marketopenclose options based on game type
function getValidMarketopenclose(gameType: string): string[] {
  switch (gameType) {
    case "single_digit":
      return ["open-bids", "close-bids"];
    case "jodi":
      return ["open-bids", "close-bids"];
    case "single_panna":
    case "double_panna":
    case "triple_panna":
      return ["open-bids", "close-bids"]; // normalized to use hyphens consistently
    case "half_sangam":
      return ["Open Ank - Close Patti", "Open Patti - Close Ank"];
    case "full_sangam":
      return ["full-sangam"];
    default:
      return [];
  }
}

// Helper function to normalize marketopenclose value
function normalizeMarketopenclose(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

// User Profile Routes
router.get("/user/profile", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    walletBalance: parseFloat(user.walletBalance as string),
    isBlocked: user.isBlocked,
    createdAt: user.createdAt.toISOString(),
  });
});

const UpdateProfileBody = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(4).optional(),
});

router.put("/user/profile", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [user] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    walletBalance: parseFloat(user.walletBalance as string),
    isBlocked: user.isBlocked,
    createdAt: user.createdAt.toISOString(),
  });
});

// Markets Routes
router.get("/user/markets", userAuthMiddleware, async (req, res): Promise<void> => {
  const markets = await db.select().from(marketsTable).where(eq(marketsTable.isActive, true));

  res.json({
    markets: markets.map(market => ({
      id: market.id,
      name: market.name,
      openTime: market.openTime,
      closeTime: market.closeTime,
      isActive: market.isActive,
      createdAt: market.createdAt.toISOString(),
    })),
  });
});




// Markets2 Routes
router.get("/user/markets2", userAuthMiddleware, async (req, res): Promise<void> => {
  const markets2 = await db.select().from(markets2Table).where(eq(markets2Table.isActive, true));

  res.json({
    markets: markets2.map(market => ({
      id: market.id,
      name: market.name,
      openTime: market.openTime,
      closeTime: market.closeTime,
      isActive: market.isActive,
      openResult: market.openResult,
      closeResult: market.closeResult,
      jodiResult: market.jodiResult,
      createdAt: market.createdAt.toISOString(),
    })),
  });
});



// Bidding Routes
const PlaceBidBody = z.object({
  marketId: z.number().int().positive(),
  gameType: z.enum(["single_digit", "jodi", "single_panna", "double_panna", "triple_panna", "half_sangam", "full_sangam"]),
  amount: z.number().positive().min(1).max(10000), // Min 1, max 10000
  number: z.string().min(1).max(6), // Max 6 digits for full sangam
  marketopenclose: z.string().optional().default("open-bids"), // Market open/close type
});

router.post("/user/bids",  userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = PlaceBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { marketId, gameType, number, amount, marketopenclose } = parsed.data;
  const userId = req.userId!;

  // Check if market exists and is active
  const [market] = await db.select().from(marketsTable).where(and(
    eq(marketsTable.id, marketId),
    eq(marketsTable.isActive, true)
  ));

  if (!market) {
    res.status(404).json({ error: "Market not found or market is inactive" });
    return;
  }

  // Check user balance and status
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBlocked) {
    res.status(403).json({ error: "User not found or blocked" });
    return;
  }

  const currentBalance = parseFloat(user.walletBalance as string);
  if (currentBalance < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Validate bid number format based on game type
  if (!isValidBidNumber(gameType, number)) {
    res.status(400).json({ error: "Invalid bid number for selected game type" });
    return;
  }

  // Normalize and validate marketopenclose based on gameType
  const normalizedMarketopenclose = normalizeMarketopenclose(marketopenclose);
  const validMarketopenclose = getValidMarketopenclose(gameType);
  if (!validMarketopenclose.includes(normalizedMarketopenclose)) {
    res.status(400).json({ 
      error: `Invalid market open/close type for ${gameType}. Valid options: ${validMarketopenclose.join(", ")}` 
    });
    return;
  }

  // Check for duplicate bid (same user, market, game type, number, normalized marketopenclose)
  const [existingBid] = await db.select()
    .from(bidsTable)
    .where(and(
      eq(bidsTable.userId, userId),
      eq(bidsTable.marketId, marketId),
      eq(bidsTable.gameType, gameType),
      eq(bidsTable.number, number),
      eq(bidsTable.marketopenclose, normalizedMarketopenclose)
    ));

  if (existingBid) {
    res.status(409).json({ error: "Duplicate bid not allowed" });
    return;
  }

  // Deduct balance and create bid in transaction
  await db.transaction(async (tx) => {
    // Deduct balance
    await tx.update(usersTable)
      .set({ walletBalance: sql`${usersTable.walletBalance} - ${amount}` })
      .where(eq(usersTable.id, userId));

    // Create bid with all details
    const currentTime = new Date();
    const [bid] = await tx.insert(bidsTable)
      .values({
        userId,
        marketId,
        marketName: market.name,
        gameType,
        amount: amount.toString(),
        number,
        marketopenclose: normalizedMarketopenclose,
        openTime: market.openTime,
        closeTime: market.closeTime,
        currentTime,
      })
      .returning();

    res.status(201).json({
      bid: {
        id: bid.id,
        marketId: bid.marketId,
        marketName: bid.marketName,
        gameType: bid.gameType,
        amount: parseFloat(bid.amount as string),
        number: bid.number,
        marketopenclose: normalizedMarketopenclose,
        openTime: bid.openTime,
        closeTime: bid.closeTime,
        currentTime: bid.currentTime?.toISOString() ?? null,
        status: bid.status,
        createdAt: bid.createdAt.toISOString(),
      },
    });
  });
});

router.get("/user/bids", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const userId = req.userId!;

  const [totalResult] = await db.select({ count: count() })
    .from(bidsTable)
    .where(eq(bidsTable.userId, userId));

  const bids = await db.select({
    id: bidsTable.id,
    marketId: bidsTable.marketId,
    marketName: bidsTable.marketName,
    gameType: bidsTable.gameType,
    amount: bidsTable.amount,
    number: bidsTable.number,
    marketopenclose: bidsTable.marketopenclose,
    openTime: bidsTable.openTime,
    closeTime: bidsTable.closeTime,
    currentTime: bidsTable.currentTime,
    status: bidsTable.status,
    createdAt: bidsTable.createdAt,
  })
    .from(bidsTable)
    .where(eq(bidsTable.userId, userId))
    .orderBy(desc(bidsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    bids: bids.map(bid => ({
      id: bid.id,
      marketId: bid.marketId,
      marketName: bid.marketName,
      gameType: bid.gameType,
      amount: parseFloat(bid.amount as string),
      number: bid.number,
      marketopenclose: bid.marketopenclose,
      openTime: bid.openTime,
      closeTime: bid.closeTime,
      currentTime: bid.currentTime?.toISOString(),
      status: bid.status,
      createdAt: bid.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Markets2 Bidding Routes (same as markets bidding)
router.post("/user/markets2-bids", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = PlaceBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { marketId, gameType, number, amount, marketopenclose } = parsed.data;
  const userId = req.userId!;

  // Check if markets2 exists and is active
  const [market] = await db.select().from(markets2Table).where(and(
    eq(markets2Table.id, marketId),
    eq(markets2Table.isActive, true)
  ));

  if (!market) {
    res.status(404).json({ error: "Market not found or market is inactive" });
    return;
  }

  // Check user balance and status
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBlocked) {
    res.status(403).json({ error: "User not found or blocked" });
    return;
  }

  const currentBalance = parseFloat(user.walletBalance as string);
  if (currentBalance < amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  // Validate bid number format
  if (!isValidBidNumber(gameType, number)) {
    res.status(400).json({ error: "Invalid bid number for selected game type" });
    return;
  }

  // Normalize and validate marketopenclose based on gameType
  const normalizedMarketopenclose = normalizeMarketopenclose(marketopenclose);
  const validMarketopenclose = getValidMarketopenclose(gameType);
  if (!validMarketopenclose.includes(normalizedMarketopenclose)) {
    res.status(400).json({ 
      error: `Invalid market open/close type for ${gameType}. Valid options: ${validMarketopenclose.join(", ")}` 
    });
    return;
  }

  // Check for duplicate bid - only against markets2 bids
  const [existingBid] = await db.select()
    .from(bidsTable)
    .innerJoin(markets2Table, eq(bidsTable.marketId, markets2Table.id))
    .where(and(
      eq(bidsTable.userId, userId),
      eq(bidsTable.marketId, marketId),
      eq(bidsTable.gameType, gameType),
      eq(bidsTable.number, number),
      eq(bidsTable.marketopenclose, normalizedMarketopenclose)
    ));

  if (existingBid) {
    res.status(409).json({ error: "Duplicate bid not allowed" });
    return;
  }

  // Deduct balance and create bid in transaction
  await db.transaction(async (tx) => {
    // Deduct balance
    await tx.update(usersTable)
      .set({ walletBalance: sql`${usersTable.walletBalance} - ${amount}` })
      .where(eq(usersTable.id, userId));

    // Create bid
    const currentTime = new Date();
    const [bid] = await tx.insert(bidsTable)
      .values({
        userId,
        marketId,
        marketName: market.name,
        gameType,
        amount: amount.toString(),
        number,
        marketopenclose: normalizedMarketopenclose,
        openTime: market.openTime,
        closeTime: market.closeTime,
        currentTime,
      })
      .returning();

    res.status(201).json({
      bid: {
        id: bid.id,
        marketId: bid.marketId,
        marketName: bid.marketName,
        gameType: bid.gameType,
        amount: parseFloat(bid.amount as string),
        number: bid.number,
        marketopenclose: normalizedMarketopenclose,
        openTime: bid.openTime,
        closeTime: bid.closeTime,
        currentTime: bid.currentTime?.toISOString() ?? null,
        status: bid.status,
        createdAt: bid.createdAt.toISOString(),
      },
    });
  });
});

// Markets2 Bid History
router.get("/user/markets2-bids", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const userId = req.userId!;

  // Get bids from markets2 only
  const bids = await db.select({
    id: bidsTable.id,
    marketId: bidsTable.marketId,
    marketName: bidsTable.marketName,
    gameType: bidsTable.gameType,
    amount: bidsTable.amount,
    number: bidsTable.number,
    marketopenclose: bidsTable.marketopenclose,
    openTime: bidsTable.openTime,
    closeTime: bidsTable.closeTime,
    currentTime: bidsTable.currentTime,
    status: bidsTable.status,
    createdAt: bidsTable.createdAt,
  })
    .from(bidsTable)
    .innerJoin(markets2Table, eq(bidsTable.marketId, markets2Table.id))
    .where(eq(bidsTable.userId, userId))
    .orderBy(desc(bidsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalResult] = await db.select({ count: count() })
    .from(bidsTable)
    .innerJoin(markets2Table, eq(bidsTable.marketId, markets2Table.id))
    .where(eq(bidsTable.userId, userId));

  res.json({
    bids: bids.map(b => ({
      id: b.id,
      marketId: b.marketId,
      marketName: b.marketName,
      gameType: b.gameType,
      amount: parseFloat(b.amount as string),
      number: b.number,
      marketopenclose: b.marketopenclose,
      openTime: b.openTime,
      closeTime: b.closeTime,
      currentTime: b.currentTime?.toISOString(),
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Markets2 Results (with automatic updates)
router.get("/user/markets2-results", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  // Get results from markets2 table directly (only 2-digit jodi result)
  const results = await db.select({
    id: markets2Table.id,
    name: markets2Table.name,
    jodiResult: markets2Table.jodiResult,
    createdAt: markets2Table.createdAt,
  })
    .from(markets2Table)
    .where(eq(markets2Table.isActive, true))
    .orderBy(desc(markets2Table.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalResult] = await db.select({ count: count() })
    .from(markets2Table)
    .where(eq(markets2Table.isActive, true));

  res.json({
    results: results.map(r => ({
      marketId: r.id,
      marketName: r.name,
      result: r.jodiResult || "N/A",
      updatedAt: r.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Deposits Routes
const CreateDepositBody = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().default("upi"),
  transactionId: z.string().optional(),
  screenshotUrl: z.string().optional(),
  status: z.string().optional(),
  upiResponse: z.string().optional(), // UPI gateway response with Status=SUCCESS/FAILURE
});

router.post("/user/deposits", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateDepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const userId = req.userId!;
    
    // Check for auto-approve conditions:
    // 1. If status field is 'success'
    // 2. If upiResponse contains 'Status=SUCCESS'
    let isAutoApprove = parsed.data.status === "success";
    
    if (!isAutoApprove && parsed.data.upiResponse) {
      isAutoApprove = parsed.data.upiResponse.includes("Status=SUCCESS");
    }

    let deposit: any;

    if (isAutoApprove) {
      // Auto-approve and update wallet in transaction
      await db.transaction(async (tx) => {
        const [newDeposit] = await tx.insert(depositsTable)
          .values({
            userId,
            amount: parsed.data.amount.toString(),
            paymentMethod: parsed.data.paymentMethod,
            transactionId: parsed.data.transactionId || null,
            screenshotUrl: parsed.data.screenshotUrl || null,
            status: "success",
            processedAt: new Date(),
          })
          .returning();
        
        deposit = newDeposit;

        // Update wallet balance
        const amount = parsed.data.amount;
        await tx.update(usersTable)
          .set({ walletBalance: sql`${usersTable.walletBalance} + ${amount}` })
          .where(eq(usersTable.id, userId));
      });
    } else {
      // Save as pending for admin review
      const [newDeposit] = await db.insert(depositsTable)
        .values({
          userId,
          amount: parsed.data.amount.toString(),
          paymentMethod: parsed.data.paymentMethod,
          transactionId: parsed.data.transactionId || null,
          screenshotUrl: parsed.data.screenshotUrl || null,
          status: "pending",
          processedAt: null,
        })
        .returning();
      
      deposit = newDeposit;
    }

    res.status(201).json({
      deposit: {
        id: deposit.id,
        amount: parseFloat(deposit.amount as string),
        status: deposit.status,
        paymentMethod: deposit.paymentMethod,
        transactionId: deposit.transactionId,
        screenshotUrl: deposit.screenshotUrl,
        createdAt: deposit.createdAt.toISOString(),
        processedAt: deposit.processedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating deposit:", error);
    res.status(500).json({ error: "Failed to create deposit", details: (error as Error).message });
  }
});

router.get("/user/deposits", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const userId = req.userId!;

  const [totalResult] = await db.select({ count: count() })
    .from(depositsTable)
    .where(eq(depositsTable.userId, userId));

  const deposits = await db.select()
    .from(depositsTable)
    .where(eq(depositsTable.userId, userId))
    .orderBy(desc(depositsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    deposits: deposits.map(deposit => ({
      id: deposit.id,
      amount: parseFloat(deposit.amount as string),
      status: deposit.status,
      paymentMethod: deposit.paymentMethod,
      transactionId: deposit.transactionId,
      screenshotUrl: deposit.screenshotUrl,
      createdAt: deposit.createdAt.toISOString(),
      processedAt: deposit.processedAt?.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Withdrawals Routes
const CreateWithdrawalBody = z.object({
  amount: z.number().positive(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  upiId: z.string().optional(),
});

router.post("/user/withdrawals", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateWithdrawalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const userId = req.userId!;

  // Check user balance
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBlocked) {
    res.status(403).json({ error: "User not found or blocked" });
    return;
  }

  const currentBalance = parseFloat(user.walletBalance as string);
  if (currentBalance < parsed.data.amount) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  const [withdrawal] = await db.insert(withdrawalsTable)
    .values({
      userId,
      ...parsed.data,
      amount: parsed.data.amount.toString(),
    })
    .returning();

  res.status(201).json({
    withdrawal: {
      id: withdrawal.id,
      amount: parseFloat(withdrawal.amount as string),
      status: withdrawal.status,
      bankName: withdrawal.bankName,
      accountNumber: withdrawal.accountNumber,
      ifscCode: withdrawal.ifscCode,
      upiId: withdrawal.upiId,
      createdAt: withdrawal.createdAt.toISOString(),
    },
  });
});

router.get("/user/withdrawals", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const userId = req.userId!;

  const [totalResult] = await db.select({ count: count() })
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, userId));

  const withdrawals = await db.select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, userId))
    .orderBy(desc(withdrawalsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    withdrawals: withdrawals.map(withdrawal => ({
      id: withdrawal.id,
      amount: parseFloat(withdrawal.amount as string),
      status: withdrawal.status,
      bankName: withdrawal.bankName,
      accountNumber: withdrawal.accountNumber,
      ifscCode: withdrawal.ifscCode,
      upiId: withdrawal.upiId,
      createdAt: withdrawal.createdAt.toISOString(),
      processedAt: withdrawal.processedAt?.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Results Routes
router.get("/user/results", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const [totalResult] = await db.select({ count: count() }).from(resultsTable);

  const results = await db.select({
    id: resultsTable.id,
    marketId: resultsTable.marketId,
    marketName: marketsTable.name,
    resultDate: resultsTable.resultDate,
    openResult: resultsTable.openResult,
    closeResult: resultsTable.closeResult,
    jodiResult: resultsTable.jodiResult,
    pannaResult: resultsTable.pannaResult,
    declaredAt: resultsTable.declaredAt,
    createdAt: resultsTable.createdAt,
  })
    .from(resultsTable)
    .leftJoin(marketsTable, eq(resultsTable.marketId, marketsTable.id))
    .orderBy(desc(resultsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    results: results.map(result => ({
      id: result.id,
      marketId: result.marketId,
      marketName: result.marketName,
      resultDate: result.resultDate,
      openResult: result.openResult,
      closeResult: result.closeResult,
      jodiResult: result.jodiResult,
      pannaResult: result.pannaResult,
      declaredAt: result.declaredAt?.toISOString(),
      createdAt: result.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Dashboard Stats
router.get("/user/dashboard", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;

  // Get user info
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  // Get bid stats
  const [bidStats] = await db.select({
    totalBids: count(),
    totalAmount: sql<number>`sum(cast(${bidsTable.amount} as decimal))`,
    wonBids: sql<number>`count(case when ${bidsTable.status} = 'won' then 1 end)`,
    lostBids: sql<number>`count(case when ${bidsTable.status} = 'lost' then 1 end)`,
    pendingBids: sql<number>`count(case when ${bidsTable.status} = 'pending' then 1 end)`,
    totalWinnings: sql<number>`sum(case when ${bidsTable.status} = 'won' then cast(${bidsTable.amount} as decimal) * 9 else 0 end)`, // Approximate winnings
  })
    .from(bidsTable)
    .where(eq(bidsTable.userId, userId));

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      walletBalance: parseFloat(user.walletBalance as string),
      isBlocked: user.isBlocked,
    },
    stats: {
      totalBids: bidStats?.totalBids ?? 0,
      totalBidAmount: bidStats?.totalAmount ?? 0,
      wonBids: bidStats?.wonBids ?? 0,
      lostBids: bidStats?.lostBids ?? 0,
      pendingBids: bidStats?.pendingBids ?? 0,
      totalWinnings: bidStats?.totalWinnings ?? 0,
    },
  });
});

// Win History
router.get("/user/wins", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const userId = req.userId!;

  const [totalResult] = await db.select({ count: count() })
    .from(bidsTable)
    .where(and(eq(bidsTable.userId, userId), eq(bidsTable.status, "won")));

  const wins = await db.select({
    id: bidsTable.id,
    marketId: bidsTable.marketId,
    marketName: marketsTable.name,
    gameType: bidsTable.gameType,
    amount: bidsTable.amount,
    number: bidsTable.number,
    status: bidsTable.status,
    createdAt: bidsTable.createdAt,
  })
    .from(bidsTable)
    .leftJoin(marketsTable, eq(bidsTable.marketId, marketsTable.id))
    .where(and(eq(bidsTable.userId, userId), eq(bidsTable.status, "won")))
    .orderBy(desc(bidsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    wins: wins.map(win => ({
      id: win.id,
      marketId: win.marketId,
      marketName: win.marketName,
      gameType: win.gameType,
      amount: parseFloat(win.amount as string),
      number: win.number,
      status: win.status,
      createdAt: win.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

// Daily Leaderboard (Top winners)
router.get("/user/leaderboard", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const limit = parseInt(req.query.limit as string) || 10;

  // Get top winners by total winnings today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const leaderboard = await db.select({
    userId: bidsTable.userId,
    userName: usersTable.name,
    totalWinnings: sql<number>`sum(cast(${bidsTable.amount} as decimal))`,
    winCount: sql<number>`count(*)`,
  })
    .from(bidsTable)
    .leftJoin(usersTable, eq(bidsTable.userId, usersTable.id))
    .where(and(
      eq(bidsTable.status, "won"),
      sql`${bidsTable.createdAt} >= ${today}`,
      sql`${bidsTable.createdAt} < ${tomorrow}`
    ))
    .groupBy(bidsTable.userId, usersTable.name)
    .orderBy(sql`sum(cast(${bidsTable.amount} as decimal)) desc`)
    .limit(limit);

  res.json({
    leaderboard: leaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      userName: entry.userName || "Anonymous",
      totalWinnings: entry.totalWinnings || 0,
      winCount: entry.winCount || 0,
    })),
  });
});

// Notices/Announcements
router.get("/user/notices", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const notices = await db.select()
    .from(noticesTable)
    .where(eq(noticesTable.isActive, true))
    .orderBy(desc(noticesTable.createdAt));

  res.json({
    notices: notices.map(notice => ({
      id: notice.id,
      title: notice.title,
      content: notice.content,
      createdAt: notice.createdAt.toISOString(),
    })),
  });
});

// Get UPI Methods available for users
router.get("/user/upi-methods",  async (_req: AuthRequest, res): Promise<void> => {
  try {
    const methods = await db.select().from(upiMethodsTable)
      .where(eq(upiMethodsTable.isActive, "true"))
      .orderBy(upiMethodsTable.createdAt);
    
    const formattedMethods = methods.map((method: any) => ({
      id: method.id,
      name: method.name,
      upiId: method.upiId,
      displayName: method.displayName || method.name,
    }));
    
    res.json(formattedMethods);
  } catch (error) {
    console.error("Error fetching UPI methods:", error);
    res.status(500).json({ error: "Failed to fetch UPI methods", details: (error as Error).message });
  }
});

// Get APK Files available for download
router.get("/user/apk-files", userAuthMiddleware, async (_req: AuthRequest, res): Promise<void> => {
  try {
    const files = await db.select().from(apkFilesTable)
      .where(eq(apkFilesTable.isActive, "true"))
      .orderBy(desc(apkFilesTable.createdAt));
    
    const formattedFiles = files.map((file: any) => ({
      id: file.id,
      filename: file.filename,
      filepath: file.filepath,
      filesize: file.filesize,
      versionCode: file.version_code,
      versionName: file.version_name,
      createdAt: file.created_at,
    }));
    
    res.json(formattedFiles);
  } catch (error) {
    console.error("Error fetching APK files:", error);
    res.status(500).json({ error: "Failed to fetch APK files", details: (error as Error).message });
  }
});

export default router;