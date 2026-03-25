import { Router, type IRouter } from "express";
import { db, upiMethodsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// GET all UPI methods
router.get("/upi-methods", authMiddleware, async (_req, res): Promise<void> => {
  try {
    const methods = await db.select().from(upiMethodsTable)
      .where(eq(upiMethodsTable.isActive, "true"))
      .orderBy(upiMethodsTable.createdAt);
    res.json(methods || []);
  } catch (error) {
    console.error("Error fetching UPI methods:", error);
    res.status(500).json({ error: "Failed to fetch UPI methods" });
  }
});

// POST new UPI method
router.post("/upi-methods", authMiddleware, async (req, res): Promise<void> => {
  try {
    const { name, upiId, displayName } = req.body;

    if (!name || !upiId) {
      res.status(400).json({ error: "Name and UPI ID are required" });
      return;
    }

    const result = await db
      .insert(upiMethodsTable)
      .values({
        name,
        upiId: upiId,
        displayName: displayName || name,
        isActive: "true",
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error("Error creating UPI method:", error);
    res.status(500).json({ error: "Failed to create UPI method", details: (error as Error).message });
  }
});

// PUT update UPI method
router.put("/upi-methods/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, upiId, displayName, isActive } = req.body;

    const result = await db
      .update(upiMethodsTable)
      .set({
        name,
        upiId,
        displayName,
        isActive,
      })
      .where(eq(upiMethodsTable.id, parseInt(String(id))))
      .returning();

    const method = result[0];

    if (!method) {
      res.status(404).json({ error: "UPI method not found" });
      return;
    }

    res.json(method);
  } catch (error) {
    console.error("Error updating UPI method:", error);
    res.status(500).json({ error: "Failed to update UPI method" });
  }
});

// DELETE UPI method
router.delete("/upi-methods/:id", authMiddleware, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await db
      .delete(upiMethodsTable)
      .where(eq(upiMethodsTable.id, parseInt(String(id))))
      .returning();

    const method = result[0];

    if (!method) {
      res.status(404).json({ error: "UPI method not found" });
      return;
    }

    res.json({ message: "UPI method deleted successfully", method });
  } catch (error) {
    console.error("Error deleting UPI method:", error);
    res.status(500).json({ error: "Failed to delete UPI method" });
  }
});

export default router;
