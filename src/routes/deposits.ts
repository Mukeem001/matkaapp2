import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, depositsTable, usersTable } from "@workspace/db";
import { ApproveDepositParams, RejectDepositParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

const formatDeposit = (d: typeof depositsTable.$inferSelect, userName: string) => ({
  id: d.id,
  userId: d.userId,
  userName,
  amount: parseFloat(d.amount as string),
  status: d.status,
  paymentMethod: d.paymentMethod,
  transactionId: d.transactionId,
  screenshotUrl: d.screenshotUrl,
  createdAt: d.createdAt.toISOString(),
  processedAt: d.processedAt?.toISOString() ?? null,
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

router.get("/deposits", authMiddleware, async (req, res): Promise<void> => {
  const { createdType, createdAfter, createdBefore } = req.query;
  
  const conditions: any[] = [];
  
  if (createdType && createdType !== 'undefined') {
    const range = getDateRangeForType(createdType as string);
    if (range) {
      conditions.push(gte(depositsTable.createdAt, range.from));
      conditions.push(lte(depositsTable.createdAt, range.to));
      console.log(`[Deposits Filter] createdType: ${createdType}, custom: no, conditions: ${conditions.length}`);
    }
  } else if (createdAfter || createdBefore) {
    if (createdAfter) {
      conditions.push(gte(depositsTable.createdAt, new Date(createdAfter as string)));
    }
    if (createdBefore) {
      conditions.push(lte(depositsTable.createdAt, new Date(createdBefore as string)));
    }
    console.log(`[Deposits Filter] createdType: undefined, custom: yes, conditions: ${conditions.length}`);
  } else {
    console.log(`[Deposits Filter] createdType: undefined, custom: no, conditions: 0`);
  }

  const deposits = await db
    .select({
      id: depositsTable.id,
      userId: depositsTable.userId,
      userName: usersTable.name,
      amount: depositsTable.amount,
      status: depositsTable.status,
      paymentMethod: depositsTable.paymentMethod,
      transactionId: depositsTable.transactionId,
      screenshotUrl: depositsTable.screenshotUrl,
      createdAt: depositsTable.createdAt,
      processedAt: depositsTable.processedAt,
    })
    .from(depositsTable)
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  console.log(`[Deposits Filter] Found ${deposits.length} deposits`);

  res.json(deposits.map(d => ({
    ...d,
    userName: d.userName ?? "Unknown",
    amount: parseFloat(d.amount as string),
    createdAt: d.createdAt.toISOString(),
    processedAt: d.processedAt?.toISOString() ?? null,
  })));
});

router.post("/deposits/:id/approve", authMiddleware, async (req, res): Promise<void> => {
  const params = ApproveDepositParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    const depositId = params.data.id;

    // Get deposit details first
    const [deposit] = await db.select().from(depositsTable).where(eq(depositsTable.id, depositId));
    if (!deposit || deposit.status !== "pending") {
      res.status(404).json({ error: "Deposit not found or already processed" });
      return;
    }

    let updatedDeposit: any;
    let user: any;

    await db.transaction(async (tx) => {
      // Update deposit status to 'success'
      const result = await tx.update(depositsTable)
        .set({ status: "success", processedAt: new Date() })
        .where(eq(depositsTable.id, depositId))
        .returning();
      
      updatedDeposit = result[0];

      // Add balance to user wallet (convert string amount to number)
      const amount = parseFloat(deposit.amount as string);
      await tx.update(usersTable)
        .set({ walletBalance: sql`${usersTable.walletBalance} + ${amount}` })
        .where(eq(usersTable.id, deposit.userId));

      // Get updated user data
      const userResult = await tx.select().from(usersTable).where(eq(usersTable.id, deposit.userId));
      user = userResult[0];
    });

    res.json(formatDeposit(updatedDeposit, user?.name ?? "Unknown"));
  } catch (error) {
    console.error("Error approving deposit:", error);
    res.status(500).json({ error: "Failed to approve deposit", details: (error as Error).message });
  }
});

router.post("/deposits/:id/reject", authMiddleware, async (req, res): Promise<void> => {
  const params = RejectDepositParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deposit] = await db.update(depositsTable)
    .set({ status: "rejected", processedAt: new Date() })
    .where(eq(depositsTable.id, params.data.id))
    .returning();

  if (!deposit) {
    res.status(404).json({ error: "Deposit not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, deposit.userId));
  res.json(formatDeposit(deposit, user?.name ?? "Unknown"));
});

export default router;
