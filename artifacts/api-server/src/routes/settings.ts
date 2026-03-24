import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

// Setup multer for QR code image upload
const qrDownloadDir = path.join(process.cwd(), "downloads", "qr-codes");
if (!fs.existsSync(qrDownloadDir)) {
  fs.mkdirSync(qrDownloadDir, { recursive: true });
}

const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, qrDownloadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `qr_${timestamp}${path.extname(file.originalname)}`;
    cb(null, filename);
  },
});

const qrUpload = multer({
  storage: qrStorage,
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg"];
    const allowedExts = [".png", ".jpg", ".jpeg"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG and JPEG images are allowed for QR code"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.get("/settings", authMiddleware, async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(settingsTable);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({ appName: "Matka Admin" }).returning();
  }
  res.json({
    appName: settings.appName,
    logoUrl: settings.logoUrl,
    supportPhone: settings.supportPhone,
    upiId: settings.upiId,
    bankName: settings.bankName,
    bankAccountNumber: settings.bankAccountNumber,
    bankIfscCode: settings.bankIfscCode,
    qrCodeUrl: settings.qrCodeUrl,
  });
});

router.put("/settings", authMiddleware, async (req, res): Promise<void> => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  let [settings] = await db.select().from(settingsTable);
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({ appName: "Matka Admin" }).returning();
  }

  const [updated] = await db.update(settingsTable).set(body.data).returning();
  res.json({
    appName: updated.appName,
    logoUrl: updated.logoUrl,
    supportPhone: updated.supportPhone,
    upiId: updated.upiId,
    bankName: updated.bankName,
    bankAccountNumber: updated.bankAccountNumber,
    bankIfscCode: updated.bankIfscCode,
    qrCodeUrl: updated.qrCodeUrl,
  });
});

// Upload QR code endpoint
router.post("/settings/upload-qr", authMiddleware, qrUpload.single("qrCode") as any, async (req, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No QR code image uploaded" });
      return;
    }

    const qrCodeUrl = `/downloads/qr-codes/${req.file.filename}`;

    // Update settings with new QR code URL
    let [settings] = await db.select().from(settingsTable);
    if (!settings) {
      [settings] = await db.insert(settingsTable).values({ appName: "Matka Admin", qrCodeUrl }).returning();
    } else {
      [settings] = await db.update(settingsTable)
        .set({ qrCodeUrl })
        .returning();
    }

    res.status(201).json({
      message: "QR code uploaded successfully",
      qrCodeUrl: qrCodeUrl,
      settings: {
        appName: settings.appName,
        qrCodeUrl: settings.qrCodeUrl,
      },
    });
  } catch (error) {
    console.error("Error uploading QR code:", error);
    res.status(500).json({ error: "Failed to upload QR code", details: (error as Error).message });
  }
});

export default router;
