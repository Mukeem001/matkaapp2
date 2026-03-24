import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, marketsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Database health check
router.get("/health/db", async (_req, res) => {
  try {
    console.log("[Health DB] Testing database connection...");
    console.log("[Health DB] DATABASE_URL is set:", !!process.env.DATABASE_URL);
    
    const markets = await db.select().from(marketsTable).limit(1);
    
    res.json({ 
      status: "ok", 
      message: "Database connection successful",
      marketsTableAccessible: true,
      sampleCount: markets.length,
      database: "Connected ✅"
    });
  } catch (error: any) {
    console.error("[Health DB] Error:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Database connection failed",
      error: error?.message || String(error),
      code: error?.code,
      detail: error?.detail,
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack
    });
  }
});

// Detailed diagnostics
router.get("/health/diagnostics", (_req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    hasDatabase: !!process.env.DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL ? "***hidden***" : "NOT SET ❌",
    hasJwtSecret: !!process.env.JWT_SECRET,
    port: process.env.PORT || "4000",
    timestamp: new Date().toISOString()
  });
});

export default router;
