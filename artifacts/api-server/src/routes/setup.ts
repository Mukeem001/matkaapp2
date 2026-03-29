import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Seed endpoint - create first admin (use with caution in production!)
router.post("/setup/seed-admin", async (req, res): Promise<void> => {
  try {
    console.log("[Setup] Attempting to seed admin account...");
    
    const email = req.body?.email || "admin@matka.com";
    const password = req.body?.password || "admin123";
    const name = req.body?.name || "Admin";

    // Check if admin already exists
    const [existing] = await db.select().from(adminsTable).where(eq(adminsTable.email, email));

    if (existing) {
      res.status(400).json({ error: "Admin already exists", email });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const [admin] = await db
      .insert(adminsTable)
      .values({
        email,
        password: hashedPassword,
        name,
      })
      .returning();

    res.json({
      message: "✅ Admin created successfully",
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
      credentials: {
        email,
        password,
      },
    });
  } catch (error: any) {
    console.error("[Setup] Error:", error);
    res.status(500).json({
      error: "Failed to create admin",
      message: error?.message,
    });
  }
});

// Reset admin credentials (if admin exists)
router.post("/setup/reset-admin", async (req, res): Promise<void> => {
  try {
    console.log("[Setup] Attempting to reset admin credentials...");
    
    const email = req.body?.email || "admin@matka.com";
    const newPassword = req.body?.password || "admin123";

    // Find existing admin
    const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, email));

    if (!admin) {
      res.status(404).json({ error: "Admin not found", email });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update admin password
    const [updated] = await db
      .update(adminsTable)
      .set({ password: hashedPassword })
      .where(eq(adminsTable.id, admin.id))
      .returning();

    res.json({
      message: "✅ Admin credentials reset successfully",
      admin: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
      },
      newCredentials: {
        email,
        password: newPassword,
      },
    });
  } catch (error: any) {
    console.error("[Setup] Error:", error);
    res.status(500).json({
      error: "Failed to reset admin",
      message: error?.message,
    });
  }
});

export default router;
