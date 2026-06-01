import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, withdrawalsTable, usersTable } from "@workspace/db";
import { ApproveWithdrawalParams, RejectWithdrawalParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

const formatWithdrawal = (w: typeof withdrawalsTable.$inferSelect, userName: string) => ({
  id: w.id,
  userId: w.userId,
  userName,
  amount: parseFloat(w.amount as string),
  status: w.status,
  bankName: w.bankName,
  accountNumber: w.accountNumber,
  ifscCode: w.ifscCode,
  upiId: w.upiId,
  createdAt: w.createdAt.toISOString(),
  processedAt: w.processedAt?.toISOString() ?? null,
});

function getDateRangeForType(type: string): { from: Date; to: Date } | null {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (type) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'yesterday':
      return { from: yesterday, to: today };
    case 'last3days':
      const last3 = new Date(today);
      last3.setDate(last3.getDate() - 3);
      return { from: last3, to: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'last7days':
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 7);
      return { from: last7, to: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'lastMonth':
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return { from: lastMonth, to: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    default:
      return null;
  }
}

router.get("/withdrawals", authMiddleware, async (req, res): Promise<void> => {
  const { createdType, createdAfter, createdBefore, userId } = req.query;
  
  const conditions: any[] = [];
  
  // Add userId filter if provided
  if (userId) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (!isNaN(userIdNum)) {
      conditions.push(eq(withdrawalsTable.userId, userIdNum));
    }
  }
  
  if (createdType && createdType !== 'undefined') {
    const range = getDateRangeForType(createdType as string);
    if (range) {
      conditions.push(gte(withdrawalsTable.createdAt, range.from));
      conditions.push(lte(withdrawalsTable.createdAt, range.to));
      console.log(`[Withdrawals Filter] createdType: ${createdType}, custom: no, conditions: ${conditions.length}`);
    }
  } else if (createdAfter || createdBefore) {
    if (createdAfter) {
      conditions.push(gte(withdrawalsTable.createdAt, new Date(createdAfter as string)));
    }
    if (createdBefore) {
      conditions.push(lte(withdrawalsTable.createdAt, new Date(createdBefore as string)));
    }
    console.log(`[Withdrawals Filter] createdType: undefined, custom: yes, conditions: ${conditions.length}`);
  } else {
    console.log(`[Withdrawals Filter] createdType: undefined, custom: no, conditions: 0`);
  }

  const withdrawals = await db
    .select({
      id: withdrawalsTable.id,
      userId: withdrawalsTable.userId,
      userName: usersTable.name,
      amount: withdrawalsTable.amount,
      status: withdrawalsTable.status,
      bankName: withdrawalsTable.bankName,
      accountNumber: withdrawalsTable.accountNumber,
      ifscCode: withdrawalsTable.ifscCode,
      upiId: withdrawalsTable.upiId,
      createdAt: withdrawalsTable.createdAt,
      processedAt: withdrawalsTable.processedAt,
    })
    .from(withdrawalsTable)
    .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(withdrawalsTable.createdAt));

  console.log(`[Withdrawals Filter] Found ${withdrawals.length} withdrawals`);

  res.json(withdrawals.map(w => ({
    ...w,
    userName: w.userName ?? "Unknown",
    amount: parseFloat(w.amount as string),
    createdAt: w.createdAt.toISOString(),
    processedAt: w.processedAt?.toISOString() ?? null,
  })));
});






router.post("/withdrawals/:id/approve", authMiddleware, async (req, res): Promise<void> => {
  const params = ApproveWithdrawalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const withdrawalId = params.data.id;

  // Get withdrawal details first
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, withdrawalId));
  if (!withdrawal || withdrawal.status !== "pending") {
    res.status(404).json({ error: "Withdrawal not found or already processed" });
    return;
  }

  // Just update status to approved (balance already deducted on request)
  const [updatedWithdrawal] = await db.update(withdrawalsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(eq(withdrawalsTable.id, withdrawalId))
    .returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, withdrawal.userId));
  res.json(formatWithdrawal(updatedWithdrawal, user?.name ?? "Unknown"));
});

router.post("/withdrawals/:id/reject", authMiddleware, async (req, res): Promise<void> => {
  const params = RejectWithdrawalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, params.data.id));
  if (!withdrawal || withdrawal.status !== "pending") {
    res.status(404).json({ error: "Withdrawal not found or already processed" });
    return;
  }

  // Refund the amount back to user wallet and update status
  let updatedWithdrawal: any;
  let user: any;
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(withdrawalsTable)
      .set({ status: "rejected", processedAt: new Date() })
      .where(eq(withdrawalsTable.id, params.data.id))
      .returning();
    updatedWithdrawal = updated;

    // Refund balance to user wallet
    await tx.update(usersTable)
      .set({ walletBalance: sql`${usersTable.walletBalance} + ${withdrawal.amount}` })
      .where(eq(usersTable.id, withdrawal.userId));

    const userResult = await tx.select().from(usersTable).where(eq(usersTable.id, withdrawal.userId));
    user = userResult[0];
  });

  res.json(formatWithdrawal(updatedWithdrawal, user?.name ?? "Unknown"));
});

export default router;
