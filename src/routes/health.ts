import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, marketsTable, markets2Table } from "@workspace/db";
import { updateMarketActivityStatus } from "../lib/scheduler.js";
import { updateMarket2ActivityStatus } from "../lib/scraper2.js";

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

// 🔧 DEBUG: Force check market activity status
router.get("/debug/check-market-status", async (_req, res) => {
  try {
    console.log("[DEBUG] Manual market status check triggered");
    
    // Get current time info
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentHours = istTime.getHours();
    const currentMinutes = istTime.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
    
    // Manually update market status
    await updateMarketActivityStatus();
    await updateMarket2ActivityStatus();
    
    // Fetch updated markets
    const market1s = await db.select().from(marketsTable);
    const market2s = await db.select().from(markets2Table);
    
    // For Market1: betting allowed until (openTime - 10 min)
    const formatMarket1Debug = (m: any) => {
      const [mOpen, mClose] = m.openTime.split(":");
      const openTimeInMinutes = parseInt(mOpen) * 60 + parseInt(mClose);
      const bettingCloseTime = openTimeInMinutes - 10;
      const shouldBeActive = currentTimeInMinutes < bettingCloseTime;
      
      const bettingCloseStr = `${String(Math.floor(bettingCloseTime / 60)).padStart(2, '0')}:${String(bettingCloseTime % 60).padStart(2, '0')}`;
      
      return {
        id: m.id,
        name: m.name,
        openTime: m.openTime,
        closeTime: m.closeTime,
        isActive: m.isActive,
        expected_shouldBeActive: shouldBeActive,
        bettingCloseTime: bettingCloseStr,
        logic: "isActive = true until (openTime - 10 min)",
        match: m.isActive === shouldBeActive ? "✅" : "❌"
      };
    };

    // For Market2: betting allowed until closeTime
    const formatMarket2Debug = (m: any) => {
      const [mClose, mCloseMin] = m.closeTime.split(":");
      const closeTimeInMinutes = parseInt(mClose) * 60 + parseInt(mCloseMin);
      const shouldBeActive = currentTimeInMinutes < closeTimeInMinutes;
      
      const closeTimeStr = `${String(Math.floor(closeTimeInMinutes / 60)).padStart(2, '0')}:${String(closeTimeInMinutes % 60).padStart(2, '0')}`;
      
      return {
        id: m.id,
        name: m.name,
        openTime: m.openTime,
        closeTime: m.closeTime,
        isActive: m.isActive,
        expected_shouldBeActive: shouldBeActive,
        bettingCloseTime: closeTimeStr,
        logic: "isActive = true until closeTime",
        match: m.isActive === shouldBeActive ? "✅" : "❌"
      };
    };
    
    res.json({
      timestamp: istTime.toISOString(),
      currentTime: currentTimeStr,
      currentTimeInMinutes,
      market1: {
        total: market1s.length,
        bettingLogic: "00:00 → (openTime - 10 min) = ACTIVE, (openTime - 10 min) → 23:59 = INACTIVE",
        data: market1s.map(formatMarket1Debug)
      },
      market2: {
        total: market2s.length,
        bettingLogic: "00:00 → closeTime = ACTIVE, closeTime → 23:59 = INACTIVE",
        data: market2s.map(formatMarket2Debug)
      },
      message: "Market status check completed. Check 'match' column - ✅ means status is correct, ❌ means it needs update"
    });
  } catch (error: any) {
    console.error("[DEBUG] Error checking market status:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Failed to check market status",
      error: error?.message || String(error)
    });
  }
});

export default router;
