# Hostinger Deployment - Exact Fixes Required

## FIX #1: Security - Remove JWT Secret Hardcoded Fallback

### File 1: artifacts/api-server/src/middlewares/auth.ts (Line 4)

**CURRENT CODE:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET || "matka-admin-secret-key-2024";
```

**FIXED CODE:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but was not provided. " +
    "Set JWT_SECRET in your .env file or environment variables."
  );
}
```

**Why:** Never have hardcoded fallback secrets. This will ensure the secret is always explicitly set in production.

---

### File 2: artifacts/api-server/src/routes/dashboard.ts (Line 7)

**CURRENT CODE:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET || "matka-admin-secret-key-2024";
```

**FIXED CODE:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but was not provided. " +
    "Set JWT_SECRET in your .env file or environment variables."
  );
}
```

---

## FIX #2: Security - Enable SSL Certificate Verification

### File: lib/db/src/index.ts (Line 13)

**CURRENT CODE:**
```typescript
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

**FIXED CODE:**
```typescript
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});
```

**Why:** In production, always verify SSL certificates to prevent MITM attacks. Local development can be more lenient.

---

## FIX #3: Update .env.example with Missing Variables

### File: artifacts/api-server/.env.example

**ADD THESE LINES** after the existing content:

```env
# =======================
# SERVER DOMAIN/URL CONFIGURATION
# =======================
# The base URL of your API server (used for downloads, etc)
APP_URL=https://api.your-domain.com
APP_BASE_URL=https://api.your-domain.com

# =======================
# IMPORTANT SECURITY NOTES
# =======================
# - JWT_SECRET: Use a strong, random string (min 32 characters)
#   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# - Never commit .env files to version control
# - All variables marked as REQUIRED must be set in production
# - Database SSL is automatically enabled in production mode
```

---

## FIX #4: Create .env.production File

**Create new file:** `artifacts/api-server/.env.production`

```env
# ============================================
# PRODUCTION ENVIRONMENT CONFIGURATION
# ============================================
# This file should be created on Hostinger during deployment
# Never commit this file to version control

# DATABASE
DATABASE_URL=postgresql://user:password@hostinger-database-host:5432/matka_db

# SERVER
PORT=4000
NODE_ENV=production

# FRONTEND (CORS)
FRONTEND_URL=https://matka.your-domain.com
FRONTEND_URL_WWW=https://www.matka.your-domain.com

# AUTHENTICATION (Replace with strong random value)
JWT_SECRET=your-super-secret-key-min-32-chars-change-this

# API CONFIGURATION
APP_URL=https://api.matka.your-domain.com
APP_BASE_URL=https://api.matka.your-domain.com
```

**⚠️ WARNING:** Don't commit this file. Add to .gitignore:
```
.env.production
.env.production.local
```

---

## FIX #5: Standardize Package Manager

### Choose ONE approach:

#### OPTION A: Stick with npm (Recommended for Hostinger)

**File: package.json** (root)
- Already using npm ✓
- Make sure all scripts use `npm`

**File: hostinger-deploy.sh**
Change from multi-part script to:
```bash
#!/bin/bash
set -e

echo "🚀 Installing dependencies..."
npm install

echo "🔨 Building monorepo..."
npm run build

echo "✅ Deployment ready!"
```

**File: Procfile**
Already correct:
```
web: npm install && npm run build && npm start
```

#### OPTION B: Switch to pnpm (If team prefers)

Update all scripts to use `pnpm --filter`:

**Root package.json:**
```json
{
  "scripts": {
    "dev": "pnpm --filter @workspace/api-server run dev",
    "build": "pnpm --filter @workspace/api-zod run build && pnpm --filter @workspace/db run build && pnpm --filter @workspace/api-server run build",
    "build:deps": "pnpm --filter @workspace/api-zod run build && pnpm --filter @workspace/db run build",
    "build:api": "pnpm --filter @workspace/api-server run build",
    "start": "node artifacts/api-server/dist/index.js",
    "typecheck": "pnpm --filter @workspace/api-server run typecheck"
  }
}
```

**Action Required:** Once chosen, commit lock file (package-lock.json OR pnpm-lock.yaml) to git.

---

## FIX #6: Fix Build Script

### File: build.ts (Root) - REPLACE ENTIRE FILE

**Current version is outdated. Replace with:**

```typescript
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildAll() {
  console.log("🔨 Building Express API Server for Hostinger...");
  
  try {
    // Step 1: Build workspace packages using TypeScript project references
    console.log("📝 Building workspace dependencies via TypeScript project references...");
    execSync("npx tsc --build tsconfig.json", {
      cwd: __dirname,
      stdio: "inherit",
    });
    
    console.log("✅ Build complete!");
    console.log("📂 Output: artifacts/api-server/dist/index.js");
    console.log("🚀 Ready to deploy!");
  } catch (err) {
    console.error("❌ Build failed:", err);
    process.exit(1);
  }
}

buildAll().catch((err) => {
  console.error("❌ Build error:", err);
  process.exit(1);
});
```

---

## FIX #7: Fix CORS Configuration for Production

### File: artifacts/api-server/src/app.ts (Lines 24-52)

**CURRENT CODE (PROBLEMATIC):**
```typescript
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.FRONTEND_URL_WWW,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:3000',
  'http://localhost:4000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

**FIXED CODE:**
```typescript
// Build allowed origins based on environment
const allowedOrigins = (() => {
  const isProduction = process.env.NODE_ENV === 'production';
  const origins = [];

  // Production URLs (always add from env vars)
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
  if (process.env.FRONTEND_URL_WWW) origins.push(process.env.FRONTEND_URL_WWW);

  // Development URLs (only in non-production)
  if (!isProduction) {
    origins.push(
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:4000'
    );
  }

  return origins.filter(Boolean);
})();

app.use(cors({
  origin: (origin, callback) => {
    // Allow no origin (mobile apps, direct API calls)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Check against whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Reject everything else
    console.warn(`CORS rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

---

## FIX #8: Add .nvmrc for Node Version Consistency

**Create new file:** `.nvmrc` (in root)

```
18.19.0
```

This ensures Hostinger and local environment use the same Node version.

---

## FIX #9: Update .gitignore to Commit Lock Files

### File: .gitignore

**CURRENT:**
```
# Dependencies
node_modules
pnpm-lock.yaml
package-lock.json
```

**FIXED:**
```
# Dependencies
node_modules

# DO NOT ignore lock files - commit these!
# Uncomment ONE based on your package manager:
# pnpm-lock.yaml  (if using pnpm)
# package-lock.json  (if using npm)

# Build outputs
dist
build
*.tsbuildinfo
```

**Action:** After choosing a package manager, run `git add -f package-lock.json` (for npm) or `git add -f pnpm-lock.yaml` (for pnpm) to commit the lock file.

---

## FIX #10: Update Error Message in Database Module

### File: lib/db/src/index.ts (Line 7-8)

**CURRENT CODE:**
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. mukeem");
}
```

**FIXED CODE:**
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required but was not provided. " +
    "Set DATABASE_URL in your .env file or environment variables."
  );
}
```

---

## FIX #11: Add Production Startup Validation

### File: artifacts/api-server/src/index.ts

**ADD VALIDATION AT TOP** (after imports):

```typescript
import "dotenv/config";
import app from "./app";

// Validate environment for production
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error("Set these variables in your .env file before starting the server.");
    process.exit(1);
  }
}

const rawPort = process.env["PORT"];
// ... rest of file
```

---

## FIX #12: Update Procfile for Hostinger

### File: Procfile

**CURRENT:**
```
web: npm run build && npm start
```

**FIXED (More efficient):**
```
web: npm install && npm run build && npm start
```

Or if using existing built artifacts:

```
web: npm start
```

**Note:** On Hostinger, you can run `npm run build` during build time in their dashboard, then use just `npm start` at runtime.

---

## FIX #13: Create Hostinger Deployment Guide

**Create new file:** `HOSTINGER_DEPLOYMENT_GUIDE.md`

```markdown
# Hostinger Deployment Guide

## Pre-Deployment Checklist

1. **Environment Variables**
   Set these in Hostinger's environment variables panel:
   - `NODE_ENV=production`
   - `PORT=4000` (or Hostinger's default port)
   - `DATABASE_URL=postgresql://...`
   - `JWT_SECRET=<strong-random-32-chars>`
   - `FRONTEND_URL=https://yourdomain.com`
   - `FRONTEND_URL_WWW=https://www.yourdomain.com`
   - `APP_URL=https://api.yourdomain.com`
   - `APP_BASE_URL=https://api.yourdomain.com`

2. **Build Command**
   ```
   npm install && npm run build
   ```

3. **Start Command**
   ```
   npm start
   ```

## Deployment Steps

1. Connect your git repository to Hostinger
2. Set environment variables in Hostinger dashboard
3. Push code to main branch
4. Hostinger will automatically run build command
5. Server will start with npm start

## Troubleshooting

- **Build fails**: Check that all dependencies install correctly
- **Server crashes**: Check environment variables are set
- **Database connection fails**: Verify DATABASE_URL is correct
- **CORS errors**: Check FRONTEND_URL matches your app domain
```

---

## IMPLEMENTATION ORDER

1. **First (Critical security):**
   - Implement Fix #1 (JWT secret)
   - Implement Fix #2 (SSL verification)
   - Implement Fix #4 (Create .env.production)

2. **Second (Build system):**
   - Implement Fix #5 (Standardize package manager)
   - Implement Fix #6 (Update build.ts)
   - Create package-lock.json or pnpm-lock.yaml

3. **Third (Configuration):**
   - Implement Fix #3 (.env.example update)
   - Implement Fix #7 (CORS fix)
   - Implement Fix #8 (.nvmrc)
   - Implement Fix #9 (.gitignore)
   - Implement Fix #10 (Error messages)

4. **Fourth (Testing & Docs):**
   - Implement Fix #11 (Validation)
   - Implement Fix #12 (Procfile)
   - Implement Fix #13 (Documentation)
   - Run `npm run build` and verify dist/ is populated
   - Test locally with .env file
   - Deploy to Hostinger

---

## VERIFICATION COMMANDS

After implementing fixes, run:

```bash
# 1. Check build works
npm run build

# 2. Verify dist folder is populated
ls -la artifacts/api-server/dist/

# 3. Check for TypeScript errors
npm run typecheck

# 4. Verify package manager used
ls -la | grep -E "package-lock.json|pnpm-lock.yaml"

# 5. Test locally with .env file
NODE_ENV=development npm start
```

---

## FILES MODIFIED SUMMARY

- ✏️ artifacts/api-server/src/middlewares/auth.ts
- ✏️ artifacts/api-server/src/routes/dashboard.ts
- ✏️ lib/db/src/index.ts
- ✏️ artifacts/api-server/src/app.ts
- ✏️ artifacts/api-server/src/index.ts
- ✏️ build.ts
- ✏️ package.json (lock file)
- ✏️ .gitignore
- ✏️ Procfile
- ➕ artifacts/api-server/.env.production (new)
- ➕ .nvmrc (new)
- ➕ HOSTINGER_DEPLOYMENT_GUIDE.md (new)
- ✏️ artifacts/api-server/.env.example

