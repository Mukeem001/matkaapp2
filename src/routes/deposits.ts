import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

router.get("/deposits", authMiddleware, async (_req, res): Promise<void> => {
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
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id));

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
