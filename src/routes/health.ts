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
    const markets = await db.select().from(marketsTable).limit(1);
    res.json({ 
      status: "ok", 
      message: "Database connection successful",
      marketsTableAccessible: true,
      sampleCount: markets.length
    });
  } catch (error: any) {
    console.error("[Health DB] Error:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Database connection failed",
      error: error?.message,
      code: error?.code
    });
  }
});

export default router;
