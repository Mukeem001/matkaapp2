import { Router, type IRouter } from "express";
import { gte, count, sum, eq, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db, usersTable, bidsTable, marketsTable, depositsTable, withdrawalsTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but was not provided. " +
    "Set JWT_SECRET in your .env file or environment variables."
  );
}

interface AuthRequest extends Request {
  adminId?: number;
  userId?: number;
}

const router = Router() as any;

// Middleware that accepts both admin and user tokens
const flexibleAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  console.log("[Dashboard] Auth header:", authHeader ? "present" : "missing");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[Dashboard] Missing or invalid Bearer token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  console.log("[Dashboard] Token preview:", token.substring(0, 20) + "...");
  console.log("[Dashboard] JWT_SECRET used:", JWT_SECRET.substring(0, 10) + "...");
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId?: number; userId?: number };
    console.log("[Dashboard] ✅ Token valid. Decoded:", decoded);
    req.adminId = decoded.adminId;
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.log("[Dashboard] ❌ Token verification failed:", (err as Error).message);
    res.status(401).json({ error: "Invalid token" });
  }
};

router.get("/dashboard/stats", flexibleAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("[Dashboard Stats] Request received");
    // Use IST timezone for today's date
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const today = new Date(now.getTime() + istOffset);
    today.setHours(0, 0, 0, 0);

    // Get counts safely
    const totalUsersCount = await db.select({ count: count() }).from(usersTable);
    const bidsCount = await db.select({ count: count() }).from(bidsTable).where(gte(bidsTable.createdAt, today));
    const activeMarketsCount = await db.select({ count: count() }).from(marketsTable).where(eq(marketsTable.isActive, true));
    const depositsTodaySum = await db.select({ total: sum(depositsTable.amount) }).from(depositsTable)
      .where(gte(depositsTable.createdAt, today));
    const withdrawalsTodaySum = await db.select({ total: sum(withdrawalsTable.amount) }).from(withdrawalsTable)
      .where(gte(withdrawalsTable.createdAt, today));

    const totalUsers = totalUsersCount[0]?.count ?? 0;
    const bidsToday = bidsCount[0]?.count ?? 0;
    const activeMarkets = activeMarketsCount[0]?.count ?? 0;
    const depositsToday = parseFloat((depositsTodaySum[0]?.total as string) ?? "0") || 0;
    const withdrawalsToday = parseFloat((withdrawalsTodaySum[0]?.total as string) ?? "0") || 0;

    console.log(`[Dashboard Stats] Counts - Users: ${totalUsers}, Bids: ${bidsToday}, Markets: ${activeMarkets}`);

    const recentBidsRaw = await db
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
      .orderBy(desc(bidsTable.createdAt))
      .limit(10);

    const recentBids = recentBidsRaw.map(b => ({
      id: b.id,
      userId: b.userId,
      userName: b.userName ?? "Unknown",
      marketId: b.marketId,
      marketName: b.marketName ?? "Unknown",
      gameType: b.gameType,
      amount: parseFloat(b.amount as string),
      number: b.number,
      openTime: b.openTime,
      closeTime: b.closeTime,
      currentTime: b.currentTime?.toISOString() ?? new Date().toISOString(),
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    }));

    console.log(`[Dashboard Stats] ✅ Found ${recentBids.length} recent bids`);
    res.json({
      totalUsers,
      totalBidsToday: bidsToday,
      totalProfit: 0,
      activeMarkets,
      depositsToday,
      withdrawalsToday,
      recentBids,
    });
  } catch (err) {
    console.log("[Dashboard Stats] ❌ Error:", (err as Error).message);
    console.log("[Dashboard Stats] Stack:", (err as Error).stack);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
