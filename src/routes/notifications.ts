import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

interface Notification {
  id?: number;
  userId: number;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// In-memory store for notifications (in production, use database)
const notificationsStore: Map<number, Notification[]> = new Map();

/**
 * POST /notifications/send
 * Send notification to a user
 */
router.post("/notifications/send", authMiddleware, async (req, res): Promise<void> => {
  try {
    const { userId, title, message } = req.body;

    // Validate input
    if (!userId || !title || !message) {
      res.status(400).json({ error: "Missing required fields: userId, title, message" });
      return;
    }

    // Check if user exists
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Create notification
    const notification: Notification = {
      userId,
      title,
      message,
      read: false,
      createdAt: new Date(),
    };

    // Store notification
    if (!notificationsStore.has(userId)) {
      notificationsStore.set(userId, []);
    }
    notificationsStore.get(userId)!.push(notification);

    console.log(`[Notifications] Sent notification to user ${userId} (${user.name}): ${title}`);

    res.json({
      success: true,
      message: `Notification sent to ${user.name}`,
      notification: {
        userId,
        title,
        message,
        sentAt: notification.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Notifications] Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

/**
 * GET /notifications/user/:userId
 * Get all notifications for a user
 */
router.get("/notifications/user/:userId", authMiddleware, async (req, res): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const userNotifications = notificationsStore.get(userId) || [];

    res.json({
      userId,
      notifications: userNotifications,
      total: userNotifications.length,
      unread: userNotifications.filter(n => !n.read).length,
    });
  } catch (error) {
    console.error("[Notifications] Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

/**
 * PUT /notifications/:id/mark-read
 * Mark notification as read
 */
router.put("/notifications/:id/mark-read", authMiddleware, async (req, res): Promise<void> => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    // Find and update notification
    for (const [userId, notifications] of notificationsStore.entries()) {
      const notification = notifications.find((n, idx) => idx === notificationId);
      if (notification) {
        notification.read = true;
        res.json({ success: true, message: "Notification marked as read" });
        return;
      }
    }

    res.status(404).json({ error: "Notification not found" });
  } catch (error) {
    console.error("[Notifications] Error marking as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

/**
 * DELETE /notifications/:id
 * Delete notification
 */
router.delete("/notifications/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    // Find and delete notification
    for (const [userId, notifications] of notificationsStore.entries()) {
      const index = notifications.findIndex((n, idx) => idx === notificationId);
      if (index !== -1) {
        notifications.splice(index, 1);
        res.json({ success: true, message: "Notification deleted" });
        return;
      }
    }

    res.status(404).json({ error: "Notification not found" });
  } catch (error) {
    console.error("[Notifications] Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
