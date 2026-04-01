import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, noticesTable, usersTable } from "@workspace/db";
import { CreateNoticeBody, DeleteNoticeParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

// GET all notices
router.get("/notices", authMiddleware, async (_req, res): Promise<void> => {
  const notices = await db.select().from(noticesTable);
  res.json(notices.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// GET notices for a specific user (for user app to fetch their notices)
router.get("/notices/user/:userId", async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userIdNum = parseInt(userId, 10);
  
  if (isNaN(userIdNum)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  // Get notices that are either broadcast (userId is null) or specific to this user
  const notices = await db.select().from(noticesTable)
    .where(eq(noticesTable.isActive, true));
  
  const userNotices = notices.filter(n => n.userId === null || n.userId === userIdNum);
  res.json(userNotices.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// POST create a global broadcast notice (send to all users)
router.post("/notices/broadcast", authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = CreateNoticeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request", details: body.error });
      return;
    }

    try {
      // Try with new schema that includes userId
      const [notice] = await db.insert(noticesTable)
        .values({
          title: body.data.title,
          content: body.data.content,
          isActive: body.data.isActive ?? true,
          userId: null,
        } as any)
        .returning();

      res.status(201).json({ 
        ...notice, 
        createdAt: notice.createdAt.toISOString(),
        broadcastType: "all_users"
      });
    } catch (innerError) {
      // If userId column doesn't exist, try without it
      console.warn("[Notice Migration] userId column might not exist yet, retrying without it:", innerError);
      const [notice] = await db.insert(noticesTable)
        .values({
          title: body.data.title,
          content: body.data.content,
          isActive: body.data.isActive ?? true,
        } as any)
        .returning();

      res.status(201).json({ 
        ...notice, 
        createdAt: notice.createdAt.toISOString(),
        broadcastType: "all_users",
        warning: "Database schema migration pending - user_id column not yet available"
      });
    }
  } catch (error) {
    console.error("[Notice Broadcast Error]", error);
    res.status(500).json({ error: "Failed to create notice", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST create a notice for specific user by ID
router.post("/notices/user/:userId", authMiddleware, async (req, res): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const userIdNum = parseInt(userId, 10);
    
    if (isNaN(userIdNum)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const body = CreateNoticeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    // Verify user exists
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userIdNum));
    if (user.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [notice] = await db.insert(noticesTable)
      .values({
        title: body.data.title,
        content: body.data.content,
        isActive: body.data.isActive ?? true,
        userId: userIdNum,
      } as any)
      .returning();

    res.status(201).json({ 
      ...notice, 
      createdAt: notice.createdAt.toISOString(),
      broadcastType: "specific_user",
      recipientId: userIdNum
    });
  } catch (error) {
    console.error("[Notice User ID Error]", error);
    res.status(500).json({ error: "Failed to create notice", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST create a notice for specific user by name
router.post("/notices/user/name/:userName", authMiddleware, async (req, res): Promise<void> => {
  try {
    const userName = Array.isArray(req.params.userName) ? req.params.userName[0] : req.params.userName;

    const body = CreateNoticeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    // Find user by name
    const allUsers = await db.select().from(usersTable);
    const user = allUsers.find(u => u.name === userName);
    
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [notice] = await db.insert(noticesTable)
      .values({
        title: body.data.title,
        content: body.data.content,
        isActive: body.data.isActive ?? true,
        userId: user.id,
      } as any)
      .returning();

    res.status(201).json({ 
      ...notice, 
      createdAt: notice.createdAt.toISOString(),
      broadcastType: "specific_user",
      recipientId: user.id,
      recipientName: user.name
    });
  } catch (error) {
    console.error("[Notice User Name Error]", error);
    res.status(500).json({ error: "Failed to create notice", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET public broadcast notices (no auth required - for public notice board)
router.get("/notices/public/broadcast", async (req, res): Promise<void> => {
  try {
    const notices = await db.select()
      .from(noticesTable)
      .where(and(
        eq(noticesTable.isActive, true),
        eq(noticesTable.userId, null as any) // Only broadcast notices
      ))
      .orderBy((t) => desc(t.createdAt));

    res.json({
      total: notices.length,
      notices: notices.map(n => ({ 
        id: n.id,
        title: n.title, 
        content: n.content, 
        createdAt: n.createdAt.toISOString(),
        type: "broadcast"
      })),
    });
  } catch (err) {
    console.error("[Public Notices] Error:", err);
    res.status(500).json({ error: "Failed to fetch notices" });
  }
});

// DELETE a notice
router.delete("/notices/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = DeleteNoticeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db.delete(noticesTable).where(eq(noticesTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Notice not found" });
    return;
  }

  res.json({ success: true, message: "Notice deleted" });
});

export default router;
