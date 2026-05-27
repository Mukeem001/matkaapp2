# ✅ SSL Error Fixed - Complete Setup Guide

## 🔴 Problem Found
The admin panel was trying to connect to **localhost:3000/api** (itself) instead of the actual **API server on localhost:4000**.

## ✅ Fixed Issues

### 1. Environment Configuration
**Root .env** (API Server)
```
PORT=4000                    ← API server runs on port 4000
DATABASE_URL=...
JWT_SECRET=...
FRONTEND_URL=http://localhost:3000  ← Admin panel location
```

**artifacts/admin-panel/.env** (Admin Panel)
```
PORT=3000                    ← Admin panel runs on port 3000
VITE_API_URL=http://localhost:4000  ← Points to actual API server
VITE_API_BASE_URL=http://localhost:4000  ← Vite proxy target
```

### 2. Network Diagram
```
Admin Panel (localhost:3000)
    ↓
    └─→ API Request to /api/auth/login
    ↓
Vite Proxy (vite.config.ts)
    ↓
    └─→ Forwards to http://localhost:4000/api/auth/login
    ↓
API Server (localhost:4000)
    ↓
    ✅ Database → Response back to Admin Panel
```

---

## 🚀 How to Start (IMPORTANT ORDER)

### Step 1: Start the API Server First
```bash
# Open Terminal 1 (in root directory)
cd c:\Users\mohdm\OneDrive\Desktop\Matka-Admin-Panel-3-master

# Make sure .env has PORT=4000
echo "PORT=4000" > .env.temp
cat .env

# Install dependencies if needed
pnpm install

# Start API server (listens on http://localhost:4000)
pnpm run dev
```

### Step 2: Start the Admin Panel
```bash
# Open Terminal 2 (in a new terminal)
cd c:\Users\mohdm\OneDrive\Desktop\Matka-Admin-Panel-3-master\artifacts\admin-panel

# Install dependencies if needed
pnpm install

# Start admin panel (listens on http://localhost:3000)
pnpm run dev
```

### Step 3: Access Admin Panel
```
Open browser: http://localhost:3000
```

---

## ✅ Verification Checklist

**API Server (Terminal 1):**
- [ ] See message: `Server listening on port 4000`
- [ ] Database connection successful
- [ ] No errors

**Admin Panel (Terminal 2):**
- [ ] See message: `Vite dev server is running at http://localhost:3000`
- [ ] Can access http://localhost:3000 in browser
- [ ] No CORS or SSL errors in browser console

**Browser Console (F12 → Network tab):**
- [ ] Login request goes to: `http://localhost:4000/api/auth/login`
- [ ] Response status: `200` or `401` (not `ERR_SSL_PROTOCOL_ERROR`)
- [ ] No red errors

---

## 🔧 Troubleshooting

### Error: "Port 3000 already in use"
```bash
# Kill the process using port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Error: "Port 4000 already in use"
```bash
# Kill the process using port 4000
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

### Error: "ERR_SSL_PROTOCOL_ERROR" (still happening)
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard reload (Ctrl+F5)
3. Check that VITE_API_URL=http://localhost:4000 (not https)
4. Check that API server is actually running on port 4000

### Error: "Failed to fetch"
1. Check that API server is running (Terminal 1)
2. Check .env PORT=4000
3. Check network tab in browser (F12) to see actual request URL

---

## 📋 Final Configuration Summary

| Component | Port | Protocol | URL |
|-----------|------|----------|-----|
| Admin Panel | 3000 | HTTP | http://localhost:3000 |
| API Server | 4000 | HTTP | http://localhost:4000 |
| API Endpoints | 4000 | HTTP | http://localhost:4000/api/* |

---

## ✅ Now Ready!
Your setup is configured correctly. Just follow the startup order above (API first, then Admin Panel).
