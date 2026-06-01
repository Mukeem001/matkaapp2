import { Router, type IRouter } from "express";
import { eq, ilike, or, count, gte, lte, and, sum } from "drizzle-orm";
import { db, usersTable, bidsTable, depositsTable, withdrawalsTable } from "@workspace/db";
import { GetUsersQueryParams, GetUserByIdParams, UpdateUserParams, UpdateUserBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

// Helper function to calculate date range for predefined filters
function getDateRangeForType(joinedType: string | undefined): { after: Date; before: Date } | null {
  if (!joinedType) return null;
  
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const today = new Date(istTime.getFullYear(), istTime.getMonth(), istTime.getDate());
  
  switch (joinedType) {
    case 'today':
      return { after: today, before: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { after: yesterday, before: today };
    case 'last3days':
      const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
      return { after: threeDaysAgo, before: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'last7days':
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { after: sevenDaysAgo, before: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'lastMonth':
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { after: monthAgo, before: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    default:
      return null;
  }
}

router.get("/users", authMiddleware, async (req, res): Promise<void> => {
  const query = GetUsersQueryParams.safeParse(req.query);
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const search = query.success ? query.data.search : undefined;
  const joinedType = query.success ? query.data.joinedType : undefined;
  const joinedAfter = query.success ? query.data.joinedAfter : undefined;
  const joinedBefore = query.success ? query.data.joinedBefore : undefined;
  const offset = (page - 1) * limit;

  let whereConditions: any[] = [];
  
  // Search condition
  if (search) {
    whereConditions.push(
      or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.phone, `%${search}%`)
      )
    );
  }
  
  // Date range condition - priority: joinedAfter/joinedBefore > joinedType
  const dateRange = getDateRangeForType(joinedType);
  
  if (joinedAfter || joinedBefore) {
    // Custom date range
    if (joinedAfter && joinedBefore) {
      whereConditions.push(
        and(
          gte(usersTable.createdAt, new Date(joinedAfter)),
          lte(usersTable.createdAt, new Date(joinedBefore))
        )
      );
    } else if (joinedAfter) {
      whereConditions.push(gte(usersTable.createdAt, new Date(joinedAfter)));
    } else if (joinedBefore) {
      whereConditions.push(lte(usersTable.createdAt, new Date(joinedBefore)));
    }
  } else if (dateRange) {
    // Predefined date range
    whereConditions.push(
      and(
        gte(usersTable.createdAt, dateRange.after),
        lte(usersTable.createdAt, dateRange.before)
      )
    );
  }

  const whereClause = whereConditions.length > 0 
    ? (whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))
    : undefined;

  const [totalResult] = await db.select({ count: count() }).from(usersTable).where(whereClause);
  const users = await db.select().from(usersTable)
    .where(whereClause)
    .limit(limit)
    .offset(offset);

  res.json({
    users: users.map(u => ({
      ...u,
      walletBalance: parseFloat(u.walletBalance as string),
      createdAt: u.createdAt.toISOString(),
    })),
    total: totalResult?.count ?? 0,
    page,
    limit,
  });
});

router.get("/users/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = GetUserByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ ...user, walletBalance: parseFloat(user.walletBalance as string), createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  // Get old user data first to check wallet balance change
  const [oldUser] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!oldUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.isBlocked !== undefined) updateData.isBlocked = body.data.isBlocked;
  if (body.data.walletBalance !== undefined) updateData.walletBalance = String(body.data.walletBalance);
  if (body.data.name !== undefined) updateData.name = body.data.name;
  if (body.data.phone !== undefined) updateData.phone = body.data.phone;

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Record wallet balance changes as admin deposits/withdrawals
  if (body.data.walletBalance !== undefined) {
    const oldBalance = parseFloat(oldUser.walletBalance as string);
    const newBalance = parseFloat(user.walletBalance as string);
    const difference = newBalance - oldBalance;

    if (difference !== 0) {
      if (difference > 0) {
        // Admin added balance - record as deposit
        await db.insert(depositsTable).values({
          userId: params.data.id,
          amount: difference.toString(),
          status: 'success',
          paymentMethod: 'admin',
          transactionId: `admin-deposit-${Date.now()}`,
          processedAt: new Date(),
        });
      } else {
        // Admin reduced balance - record as withdrawal
        await db.insert(withdrawalsTable).values({
          userId: params.data.id,
          amount: Math.abs(difference).toString(),
          status: 'success',
          upiId: 'admin-adjustment',
          processedAt: new Date(),
        });
      }
    }
  }

  res.json({ ...user, walletBalance: parseFloat(user.walletBalance as string), createdAt: user.createdAt.toISOString() });
});

router.delete("/users/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid ID", details: params.error });
      return;
    }

    const userId = params.data.id;
    console.log(`[Delete User] Attempting to delete user with ID: ${userId}`);

    // Delete all related records (cascade delete)
    console.log(`[Delete User] Deleting related bids...`);
    await db.delete(bidsTable).where(eq(bidsTable.userId, userId));

    console.log(`[Delete User] Deleting related deposits...`);
    await db.delete(depositsTable).where(eq(depositsTable.userId, userId));

    console.log(`[Delete User] Deleting related withdrawals...`);
    await db.delete(withdrawalsTable).where(eq(withdrawalsTable.userId, userId));

    // Now delete the user
    console.log(`[Delete User] Deleting user record...`);
    const [user] = await db.delete(usersTable).where(eq(usersTable.id, userId)).returning();
    if (!user) {
      console.log(`[Delete User] User not found with ID: ${userId}`);
      res.status(404).json({ error: `User not found with ID: ${userId}` });
      return;
    }

    console.log(`[Delete User] Successfully deleted user: ${user.id} (${user.email}) and all related records`);
    res.json({ message: "User and related records deleted successfully", user: { ...user, walletBalance: parseFloat(user.walletBalance as string), createdAt: user.createdAt.toISOString() } });
  } catch (err) {
    console.error("[Delete User] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/users/:id/stats", authMiddleware, async (req, res): Promise<void> => {
  try {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const userId = params.data.id;

    // Get total deposits (success only)
    const [depositResult] = await db
      .select({ total: sum(depositsTable.amount) })
      .from(depositsTable)
      .where(and(eq(depositsTable.userId, userId), eq(depositsTable.status, "success")));

    // Get total withdrawals (success only)
    const [withdrawalResult] = await db
      .select({ total: sum(withdrawalsTable.amount) })
      .from(withdrawalsTable)
      .where(and(eq(withdrawalsTable.userId, userId), eq(withdrawalsTable.status, "success")));

    // Get total bids count
    const [totalBidsResult] = await db
      .select({ total: count() })
      .from(bidsTable)
      .where(eq(bidsTable.userId, userId));

    // Get bids won count
    const [bidsWonResult] = await db
      .select({ total: count() })
      .from(bidsTable)
      .where(and(eq(bidsTable.userId, userId), eq(bidsTable.status, "won")));

    // Get total winnings (won bids * multiplier)
    const wonBids = await db
      .select({ amount: bidsTable.amount, gameType: bidsTable.gameType })
      .from(bidsTable)
      .where(and(eq(bidsTable.userId, userId), eq(bidsTable.status, "won")));

    const totalWinnings = wonBids.reduce((sum, bid) => {
      const multiplier = bid.gameType === "jodi" ? 90 : 9;
      return sum + (parseFloat(bid.amount as string) * multiplier);
    }, 0);

    // Get total losses (lost bids amount)
    const [lossesResult] = await db
      .select({ total: sum(bidsTable.amount) })
      .from(bidsTable)
      .where(and(eq(bidsTable.userId, userId), eq(bidsTable.status, "lost")));

    res.json({
      totalDeposits: parseFloat(depositResult?.total as string) || 0,
      totalWithdrawals: parseFloat(withdrawalResult?.total as string) || 0,
      totalBets: totalBidsResult?.total ?? 0,
      betsWon: bidsWonResult?.total ?? 0,
      totalWinnings: totalWinnings,
      totalLosses: parseFloat(lossesResult?.total as string) || 0,
    });
  } catch (err) {
    console.error("[User Stats] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
