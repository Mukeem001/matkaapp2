import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, adminsTable, usersTable } from "@workspace/db";
import { AdminLoginBody } from "@workspace/api-zod";
import { authMiddleware, signToken, signUserToken, userAuthMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const parsed = AdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { email, password } = parsed.data;
    const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, email));

    if (!admin) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken(admin.id);
    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        createdAt: admin.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error", details: error?.message });
  }
});

const UserLoginBody = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/user/login", async (req, res): Promise<void> => {
  try {
    const parsed = UserLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { phone, password } = parsed.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));

    if (!user || user.isBlocked) {
      res.status(401).json({ error: "Invalid phone or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid phone or password" });
      return;
    }

    const token = signUserToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        walletBalance: parseFloat(user.walletBalance as string),
        isBlocked: user.isBlocked,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("User login error:", error);
    res.status(500).json({ error: "Internal server error", details: error?.message });
  }
});

const SignupBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(4),
  password: z.string().min(6),
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { name, phone, password } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (existing) {
    res.status(409).json({ error: "Phone already in use" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.insert(usersTable)
    .values({
      name,
      email: `user_${phone}@matka.local`,
      phone,
      password: hashedPassword,
    })
    .returning();
  const user = result[0];

  if (!user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  const token = signUserToken(user.id);
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      walletBalance: parseFloat(user.walletBalance as string),
      isBlocked: user.isBlocked,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.get("/auth/me", authMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, req.adminId!));
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  res.json({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    createdAt: admin.createdAt.toISOString(),
  });
});

router.get("/auth/user/me", userAuthMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    walletBalance: parseFloat(user.walletBalance as string),
    isBlocked: user.isBlocked,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
