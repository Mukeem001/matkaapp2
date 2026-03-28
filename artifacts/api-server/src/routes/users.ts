import { Router, type IRouter } from "express";
import { eq, ilike, or, count, gte, lte, and } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
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

  // Debug logging
  console.log(`[Users Filter] joinedType: ${joinedType}, custom: ${joinedAfter ? 'yes' : 'no'}, conditions: ${whereConditions.length}`);

  const [totalResult] = await db.select({ count: count() }).from(usersTable).where(whereClause);
  const users = await db.select().from(usersTable)
    .where(whereClause)
    .limit(limit)
    .offset(offset);

  console.log(`[Users Filter] Found ${users.length} users`);

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

  res.json({ ...user, walletBalance: parseFloat(user.walletBalance as string), createdAt: user.createdAt.toISOString() });
});

export default router;
