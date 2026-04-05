import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";
import { startScheduler } from "./lib/scheduler.js";
import { db, apkFilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import path from "path";

const app: Express = express();

// ✅ Security and Performance Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  return next();
});

// ✅ CORS Configuration for production
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.FRONTEND_URL_WWW,
  process.env.HOSTINGER_URL, // Hostinger admin panel URL
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:3000',
  'http://localhost:4000',
  'https://kalyan-matka.online', // Add your Hostinger domain
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow no origin (like mobile apps or direct API calls)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }
    }
    
    // In production, check against whitelist OR allow same-domain requests
    if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
      callback(null, true);
      return;
    }
    
    // Log CORS rejections for debugging
    console.warn(`[CORS] Rejected request from: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Welcome API
app.get("/", (_req, res) => {
  res.json({
    message: "Welcome to Matka Admin API Server",
    version: "1.0.0",
    status: "Server is running successfully",
    timestamp: new Date().toISOString(),
    endpoints: {
      api: "/api",
      health: "/health",
      downloads: "/downloads",
    },
  });
});

// ✅ Health Check
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ✅ Static APK serving
app.use(
  "/downloads",
  express.static(path.join(process.cwd(), "downloads"))
);

// ✅ API routes
app.use("/api", router);

// ✅ App update API - Dynamic version from DB
app.get("/api/app/check-update", async (_req, res): Promise<void> => {
  try {
    // Fetch latest active APK from database
    const apkFiles = await db
      .select()
      .from(apkFilesTable)
      .where(eq(apkFilesTable.isActive, "true"));

    if (!apkFiles || apkFiles.length === 0) {
      res.json({
        hasUpdate: false,
        message: "No APK available for download",
      });
      return;
    }

    // Get the most recent one
    const activeApk = apkFiles[apkFiles.length - 1];

    res.json({
      hasUpdate: true,
      latestVersion: activeApk.versionName || "1.0.0",
      latestVersionCode: activeApk.versionCode || "1",
      downloadUrl: `https://kalyan-matka.online/kalyan.apk`,
      isForceUpdate: false,
      whatsNew: `Updated to version ${activeApk.versionName}`,
    });
  } catch (error) {
    console.error("[Check Update] Error:", error);
    res.json({
      hasUpdate: false,
      error: "Failed to check updates",
    });
  }
});

// ✅ Scheduler
startScheduler();

export default app;