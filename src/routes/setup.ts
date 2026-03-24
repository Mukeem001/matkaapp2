import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";

const router: IRouter = Router();

// Seed endpoint - create first admin (use with caution in production!)
router.post("/setup/seed-admin", async (req, res): Promise<void> => {
  try {
    console.log("[Setup] Attempting to seed admin account...");
    
    const email = req.body?.email || "admin@matka.com";
    const password = req.body?.password || "admin@123";
    const name = req.body?.name || "Admin";

    // Check if admin already exists
    const existing = await db.query.adminsTable.findFirst({
      where: (admins, { eq }) => eq(admins.email, email),
    }).catch(() => null);

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

export default router;
