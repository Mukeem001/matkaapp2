# 🚀 Render Deployment Guide - Matka API Server

## Overview
This guide walks you through deploying the Matka Admin Panel API Server to Render.com

---

## Prerequisites

- ✅ GitHub account (to host your code)
- ✅ Render account (free tier available)
- ✅ PostgreSQL database on Render (already configured)
- ✅ API Server ready (locally tested)

---

## Step 1: Prepare Your GitHub Repository

### 1.1 Push code to GitHub
```bash
cd c:\Users\mohdm\OneDrive\Desktop\Matka-Admin-Panel-3-master
git add .
git commit -m "Clean project - ready for Render deployment"
git push origin main
```

### 1.2 Ensure .gitignore is correct
The following should be in .gitignore (already configured):
- `node_modules/`
- `.env.local`
- `dist/`
- `.DS_Store`

---

## Step 2: Create Render Web Service

### 2.1 Go to Render Dashboard
- Visit https://render.com
- Sign in or create account
- Click "New +" → "Web Service"

### 2.2 Connect Your GitHub
- Select "GitHub"
- Authorize and select your Matka-Admin-Panel repository

### 2.3 Configure the Service
**Name:** `matka-api-server`

**Environment:** `Node`

**Region:** `Oregon` (or closest to your users)

**Branch:** `main`

**Build Command:**
```
npm install && npm run build
```

**Start Command:**
```
npm start
```

---

## Step 3: Environment Variables

### 3.1 Add to Render Dashboard
Go to Service Settings → Environment

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `4000` | Default port |
| `DATABASE_URL` | `postgresql://matka_kt14_user:...` | Already set |
| `JWT_SECRET` | Generate secure key | ⚠️ CHANGE THIS |
| `APP_URL` | `https://matka-api-server.onrender.com` | Your Render URL |
| `FRONTEND_URL` | `https://matka-admin.hostinger.in` | Your frontend URL |
| `FRONTEND_URL_WWW` | `https://www.matka-admin.hostinger.in` | WWW variant |

### 3.2 Generate JWT_SECRET
Use one of these methods:

**Option A - OpenSSL:**
```bash
openssl rand -base64 32
```

**Option B - Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Example:**
```
rX9pZ2Q5kL8mN0vBcD7eF3gHjI1xY6aQsT2uW4vC5xN8
```

---

## Step 4: Configure Health Check (Optional)

### 4.1 Add Health Check
- **Health Check Path:** `/api/health` or just `/`
- **Health Check Interval:** `300` seconds

This helps Render monitor your service.

---

## Step 5: Deploy

### 5.1 Click "Create Web Service"
- Render will automatically start building
- Watch the build logs

### 5.2 Monitor Build Progress
Look for:
```
✅ Build succeeded
✅ Deployment started
✅ Service is running
```

### 5.3 Get Your URL
Once deployed, you'll see:
```
Service URL: https://matka-api-server.onrender.com
```

---

## Step 6: Verify Deployment

### 6.1 Test the API
```bash
curl https://matka-api-server.onrender.com/api/health
```

### 6.2 Check Logs
- Go to Service → Logs
- Look for: `Server listening on port 4000`

### 6.3 Test with Frontend
Update your frontend's `VITE_API_URL` to:
```
https://matka-api-server.onrender.com
```

---

## Common Issues & Fixes

### ❌ Build Failed: "Cannot find module"
**Fix:** Ensure all workspace packages are properly linked
```bash
pnpm install
npm run build
```

### ❌ Service Crashes: "JWT_SECRET not provided"
**Fix:** Add JWT_SECRET to Render environment variables

### ❌ Database Connection Failed
**Fix:** Verify DATABASE_URL environment variable has correct credentials

### ❌ Health Check Failing
**Fix:** Ensure `/api/health` endpoint exists or update health check path

---

## Monitoring & Maintenance

### 📊 View Logs
```
Service Dashboard → Logs
```

### 🔄 Restart Service
```
Service → Restart
```

### 📈 Check Metrics
```
Service → Metrics
```

### 🚀 Deploy New Version
Push to `main` branch - Render auto-deploys

---

## Update Frontend with New API URL

### In `artifacts/admin-panel/.env`:
```
VITE_API_URL=https://matka-api-server.onrender.com
```

---

## Useful Commands

### Build locally to test
```bash
cd artifacts/api-server
npm install
npm run build
npm start
```

### Check file size
```
du -sh dist/
```

### View environment variables
```
Render Dashboard → Service Settings → Environment
```

---

## Support

- **Render Docs:** https://render.com/docs
- **Node.js on Render:** https://render.com/docs/deploy-node-express-app
- **Database:** https://render.com/docs/databases

---

**✅ You're ready to deploy!**
