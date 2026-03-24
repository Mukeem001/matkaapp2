# Hostinger Node.js Deployment Compatibility Analysis
**Generated:** March 24, 2026  
**Project:** Matka Admin Panel 3  
**Status:** ⚠️ MULTIPLE CRITICAL ISSUES IDENTIFIED

---

## 🔴 CRITICAL ISSUES (Must Fix Before Deployment)

### 1. **Empty Build Output Directory**
- **File:** [artifacts/api-server/dist](artifacts/api-server/dist)
- **Issue:** Folder is completely empty - no `dist/index.js` exists
- **Impact:** The main entry point `artifacts/api-server/dist/index.js` (specified in root [package.json](package.json#L4)) cannot be executed
- **Why:** Build process has never been run or failed to generate output
- **Fix Required:** Run full build process before deployment

### 2. **Package Manager Inconsistency (npm vs pnpm)**
- **Issues Found:**
  - Root [package.json](package.json#L1) uses `npm` commands
  - [hostinger-deploy.sh](hostinger-deploy.sh#L2) mentions "Monorepo Build" - implies structured workspace
  - [render.yaml](render.yaml#L5) uses `yarn workspace` command
  - [scripts/post-merge.sh](scripts/post-merge.sh#L3) uses `pnpm install --frozen-lockfile`
  - [artifacts/api-server/.replit-artifact/artifact.toml](artifacts/api-server/.replit-artifact/artifact.toml#L13-L16) uses `pnpm --filter`
  - **.gitignore** ignores `pnpm-lock.yaml` ([.gitignore](gitignore#L3))
  - NO `package-lock.json` found anywhere
  - NO `pnpm-lock.yaml` checked in

- **Impact:** 
  - Hostinger won't know which package manager to use
  - Dependency installation will fail or be inconsistent
  - Build scripts may not work as expected

- **Required Action:** Choose ONE package manager and standardize all scripts

### 3. **Missing .env File**
- **File:** [artifacts/api-server/.env.example](artifacts/api-server/.env.example) exists but NO `.env` file
- **Issue:** All critical environment variables are required but not provided
- **Environment Variables REQUIRED:**
  - `DATABASE_URL` (Line 6 in .env.example) - **CRITICAL**
  - `PORT` (Line 11) - defaults to 3000, needs to match Hostinger port
  - `NODE_ENV` (Line 12) - must be `production`
  - `JWT_SECRET` (Line 17) - **CRITICAL for auth**
  - `FRONTEND_URL` (Line 16)
  - `FRONTEND_URL_WWW` (Line 17)
  - `APP_URL` (used in [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts#L104))
  - `APP_BASE_URL` (used in [artifacts/api-server/src/routes/apk-files.ts](artifacts/api-server/src/routes/apk-files.ts#L146))

- **Missing Variables in .env.example:**
  - `APP_URL` - used in code but not documented
  - `APP_BASE_URL` - used in code but not documented

### 4. **Database Connection Hardcoded Errors**
- **File:** [lib/db/src/index.ts](lib/db/src/index.ts#L7-L8)
- **Code:**
  ```typescript
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. mukeem");
  }
  ```
- **Issue:** Error message contains casual text "mukeem" - not production-quality
- **Impact:** If DATABASE_URL is not set, deployment will crash with unprofessional error message
- **Fix:** Update error message and ensure DATABASE_URL is always set in production

### 5. **Weak JWT Secret Default Value**
- **File:** [artifacts/api-server/src/middlewares/auth.ts](artifacts/api-server/src/middlewares/auth.ts#L4)
- **Code:** 
  ```typescript
  const JWT_SECRET = process.env.JWT_SECRET || "matka-admin-secret-key-2024";
  ```
- **Issue:** 
  - Has hardcoded fallback secret
  - If `JWT_SECRET` env var is not set, it falls back to weak, predictable secret
  - Same issue in [artifacts/api-server/src/routes/dashboard.ts](artifacts/api-server/src/routes/dashboard.ts#L7)
- **Impact:** Major security vulnerability if JWT_SECRET is not properly configured
- **Fix:** Remove fallback, require JWT_SECRET to be explicitly set in production

### 6. **Duplicate JWT Secret Definition**
- **Files:** 
  - [artifacts/api-server/src/middlewares/auth.ts](artifacts/api-server/src/middlewares/auth.ts#L4)
  - [artifacts/api-server/src/routes/dashboard.ts](artifacts/api-server/src/routes/dashboard.ts#L7)
- **Issue:** Same constant defined in multiple places with fallback values
- **Impact:** Inconsistency, difficulty in maintenance, security risk
- **Fix:** Centralize JWT_SECRET management

### 7. **TypeScript Build Script Mismatch**
- **File:** Root [build.ts](build.ts) vs [artifacts/api-server/build.ts](artifacts/api-server/build.ts)
- **Root build.ts uses:** `tsc --project tsconfig.json --outDir dist --rootDir src` (outdated)
- **API Server build.ts uses:** `tsc --build tsconfig.json` (correct for monorepo)
- **Issue:** Root build.ts is for old single-file setup; API server uses project references correctly
- **Impact:** Build script may not work correctly; unclear which should be used for Hostinger

### 8. **CORS Configuration Issues in Production**
- **File:** [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts#L24-L52)
- **Issues:**
  - Lines 24-30: CORS headers set globally BEFORE the CORS middleware
  - Line 40-44: Allowlist includes hardcoded localhost URLs (5173-5178, 3000, 4000)
  - Line 46: Only checks environment in dev mode, fallback is not secure
  - Line 57: Falls back to `'*'` for development but this may leak into production

- **Impact:** Potential CORS bypass, security vulnerability
- **Fix:** Ensure production CORS is strictly configured with proper domain whitelist

### 9. **Missing PORT Configuration in Hostinger Render Config**
- **File:** [render-api-server.yaml](render-api-server.yaml)
- **Issue:** Runtime hardcoded to `node-18` (Line 5) - may be outdated
- **Note:** Hostinger may not use Render configs - needs verification
- **Missing:** Explicit build and start commands for Hostinger

### 10. **Missing Admin Panel Build Output**
- **File:** [artifacts/admin-panel/dist](artifacts/admin-panel/dist) - likely doesn't exist
- **Issue:** React frontend needs to be built before deployment
- **Impact:** If serving static files from API server, build will fail

---

## 🟡 MAJOR ISSUES (Must Fix for Production)

### 11. **Monorepo Build Process Unclear for Hostinger**
- **Files:** 
  - Root [package.json scripts](package.json#L13-L17):
    - `build:deps` - uses relative paths `cd lib/api-zod`, `cd ../db`, `cd ../..`
    - `build:api` - same issue
  - [hostinger-deploy.sh](hostinger-deploy.sh) - shell script not useful for Hostinger
  - [hostinger-deploy.bat](hostinger-deploy.bat) - Windows batch file (not for server)

- **Issues:**
  - Build scripts use `cd` commands which may not work on Hostinger
  - Scripts run `npm install` multiple times (inefficient)
  - TypeScript project references not utilized in root build
  - No single command to build entire monorepo

- **Fix:** Create monorepo-based build that uses TypeScript project references properly

### 12. **Missing TypeScript Declaration Files**
- **File:** [lib/api-zod/dist/generated](lib/api-zod/dist/generated) - index.d.ts exists but source files unclear
- **File:** [lib/db/dist](lib/db/dist) - has index.d.ts but missing index.js
- **Issue:** Packages export types but may not export working JavaScript
- **Impact:** Runtime imports may fail; TypeScript definitions incomplete

### 13. **Database Schema Not Generated**
- **File:** [lib/db/src/schema](lib/db/src/schema)
- **Issue:** Schema must be generated before build, but no schema files visible in dist
- **Impact:** Database queries will fail

### 14. **Missing API Client Generation**
- **File:** [lib/api-spec/orval.config.ts](lib/api-spec/orval.config.ts)
- **Issue:** `@workspace/api-client-react` needs to be generated from OpenAPI spec
- **Generated files:** [lib/api-client-react/src/generated](lib/api-client-react/src/generated)
- **Problem:** No indication that codegen runs during build
- **Impact:** React client may have stale generated code

### 15. **Inline cross-env Usage**
- **File:** [artifacts/api-server/package.json](artifacts/api-server/package.json#L5)
- **Dev script:** `"dev": "cross-env NODE_ENV=development tsx ./src/index.ts"`
- **Issue:** Build script doesn't set NODE_ENV
- **Impact:** Compilation might happen in wrong environment context

### 16. **Multiple dist/public Path Issues**
- **File:** [artifacts/admin-panel/vite.config.ts](artifacts/admin-panel/vite.config.ts#L35)
- **Code:** `outDir: path.resolve(import.meta.dirname, "dist/public")`
- **Issue:** Frontend builds to `dist/public`, but API expects different structure
- **Impact:** Serving static files may not work as expected

---

## 🟠 DEPENDENCY & TECHNICAL ISSUES

### 17. **TypeScript Module Resolution Mismatch**
- **Root tsconfig.json uses:** `"module": "ES2020"` and `"moduleResolution": "bundler"`
- **Base tsconfig.json uses:** `"moduleResolution": "bundler"`
- **Issue:** Works locally but may have issues in certain Node.js environments
- **Fix:** Verify ES module support on Hostinger Node.js version

### 18. **Missing Node.js Version Lock in Hostinger Config**
- **File:** Root [package.json](package.json#L7) specifies `"node": ">=18.0.0"`
- **Issue:** No `.nvmrc` file to lock specific Node version
- **Issue:** No `engines` field in API server [package.json](artifacts/api-server/package.json)
- **Impact:** Hostinger might use incompatible Node.js version

### 19. **Process.argv Usage Not Found but ssl: { rejectUnauthorized: false }**
- **File:** [lib/db/src/index.ts](lib/db/src/index.ts#L13)
- **Code:** `ssl: { rejectUnauthorized: false }`
- **Issue:** Disables SSL certificate verification - MAJOR SECURITY ISSUE
- **Impact:** Vulnerable to MITM attacks in production
- **Fix:** Use proper SSL certificate handling:
  ```typescript
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
  ```

### 20. **APK File Download Path Issues**
- **File:** [artifacts/api-server/src/routes/apk-files.ts](artifacts/api-server/src/routes/apk-files.ts#L146)
- **Code:** `downloadUrl: ${process.env.APP_BASE_URL || "http://localhost:4000"}${latestApk.filepath}`
- **Issue:** 
  - Falls back to localhost (won't work in production)
  - APP_BASE_URL not in .env.example
  - Path resolution may not work on Hostinger file system

---

## 📋 CONFIGURATION GAPS

### 21. **Missing Hostinger-Specific Configuration**
- No `hostinger.yaml` or equivalent deployment config
- No documentation for Hostinger deployment process
- Render configs exist but not directly compatible with Hostinger

### 22. **Missing Health Check Endpoint Validation**
- [render-api-server.yaml](render-api-server.yaml#L9) specifies: `healthCheckPath: /api/health`
- API has `GET /health` but unclear if `/api/health` exists
- For Hostinger, need to verify correct health check endpoint

### 23. **Missing Error Handling in Server Startup**
- **File:** [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts) looks good but unclear how errors are handled
- **File:** [artifacts/api-server/src/index.ts](artifacts/api-server/src/index.ts#L1-L18) has basic error handling
- **Issue:** No graceful shutdown, signal handlers, or connection cleanup

### 24. **Missing Logging Configuration**
- No logging framework configured
- Console.log used throughout codebase
- Hostinger logs may not capture errors properly

### 25. **No Production-Ready Startup Script**
- Procfile specifies: `web: npm run build && npm start`
- Issue: Rebuilding on every startup is inefficient
- Should use pre-built artifacts

---

## ✅ WHAT'S WORKING CORRECTLY

1. ✅ Express.js server structure is sound ([artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts))
2. ✅ TypeScript project references properly set up in [tsconfig.json](tsconfig.json)
3. ✅ Environment variable structure is good (even if implementation is weak)
4. ✅ Database schema integration with Drizzle ORM looks correct
5. ✅ Modular route structure in [artifacts/api-server/src/routes](artifacts/api-server/src/routes)
6. ✅ Scheduler/cron job setup exists
7. ✅ JWT authentication infrastructure exists

---

## 📊 PRIORITY FIXES SUMMARY

| Priority | Issue | File | Fix Type | Effort |
|----------|-------|------|----------|--------|
| 🔴 P0 | Empty dist/ folder | artifacts/api-server/dist | Build system | High |
| 🔴 P0 | npm vs pnpm conflict | Multiple | Standardize | Medium |
| 🔴 P0 | Missing .env | artifacts/api-server/.env.example | Config | Low |
| 🔴 P0 | DATABASE_URL required but not optional | lib/db/src/index.ts | Configuration | Low |
| 🔴 P0 | Build script mismatch | build.ts, artifacts/api-server/build.ts | Build system | High |
| 🟡 P1 | Weak JWT secret fallback | middlewares/auth.ts, routes/dashboard.ts | Security | Medium |
| 🟡 P1 | CORS configuration for production | artifacts/api-server/src/app.ts | Security | Medium |
| 🟡 P1 | SSL certificate bypass | lib/db/src/index.ts | Security | Low |
| 🟡 P1 | Monorepo build documentation | package.json scripts | Documentation | Low |
| 🟠 P2 | APP_BASE_URL/APP_URL not documented | .env.example | Documentation | Low |
| 🟠 P2 | Missing .nvmrc | Root directory | Configuration | Low |
| 🟠 P2 | APK download path fallback | routes/apk-files.ts | Configuration | Low |

---

## 🚀 DEPLOYMENT READINESS CHECKLIST

- [ ] Build artifacts created (dist/index.js exists)
- [ ] Package manager standardized (npm OR pnpm)
- [ ] .env file created with all required variables
- [ ] DATABASE_URL environment variable set and tested
- [ ] JWT_SECRET environment variable set (no fallback in production)
- [ ] NODE_ENV set to "production"
- [ ] PORT configured for Hostinger
- [ ] FRONTEND_URL and FRONTEND_URL_WWW configured
- [ ] CORS whitelist updated for production domain
- [ ] SSL certificate verification enabled
- [ ] Health check endpoint tested and working
- [ ] node_modules and dist/ not committed to git
- [ ] pnpm-lock.yaml or package-lock.json checked in
- [ ] Hostinger deployment command finalized
- [ ] Error logs monitored and working
- [ ] Database migrations run before server start

---

## 🔗 AFFECTED FILES BY CATEGORY

### Build & Dependencies
- [package.json](package.json)
- [artifacts/api-server/package.json](artifacts/api-server/package.json)
- [lib/api-zod/package.json](lib/api-zod/package.json)
- [lib/db/package.json](lib/db/package.json)
- [build.ts](build.ts)
- [artifacts/api-server/build.ts](artifacts/api-server/build.ts)

### Configuration
- [.env.example](artifacts/api-server/.env.example) - Missing variables
- [tsconfig.json](tsconfig.json)
- [artifacts/api-server/tsconfig.json](artifacts/api-server/tsconfig.json)
- [lib/db/drizzle.config.ts](lib/db/drizzle.config.ts)

### Security
- [artifacts/api-server/src/middlewares/auth.ts](artifacts/api-server/src/middlewares/auth.ts) - Line 4
- [artifacts/api-server/src/routes/dashboard.ts](artifacts/api-server/src/routes/dashboard.ts) - Line 7
- [lib/db/src/index.ts](lib/db/src/index.ts) - Line 13
- [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts) - Lines 24-52

### Entry Points
- [artifacts/api-server/src/index.ts](artifacts/api-server/src/index.ts)
- [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts)

### Database
- [lib/db/src/index.ts](lib/db/src/index.ts)
- [lib/db/drizzle.config.ts](lib/db/drizzle.config.ts)

---

## 📝 NEXT STEPS

1. **Immediate (Today):**
   - Choose between npm or pnpm and standardize
   - Create lock file (package-lock.json or pnpm-lock.yaml)
   - Generate .env file from .env.example

2. **Short-term (This week):**
   - Fix security issues (JWT secret, SSL certificate)
   - Run full build process and verify dist/index.js exists
   - Update CORS configuration for production
   - Test database connection

3. **Medium-term (Before deployment):**
   - Create comprehensive Hostinger deployment documentation
   - Set up proper error logging and monitoring
   - Add .nvmrc for Node version consistency
   - Test entire deployment process

