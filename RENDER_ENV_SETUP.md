# Render Deployment Environment Variables

This document explains how to set environment variables in Render for the Matka Admin Panel deployment.

## Required Environment Variables

### VITE_API_URL
- **Value**: `https://matka-api-server.onrender.com` (WITHOUT `/api` prefix)
- **Why**: The generated API paths already include `/api/` (e.g., `/api/auth/login`, `/api/users`)
- **Adding /api in VITE_API_URL would result in**: `https://matka-api-server.onrender.com/api/api/auth/login` ❌

## How to Set Environment Variables in Render

1. Go to https://dashboard.render.com
2. Select your **admin-panel** web service (kalyan-matka.online)
3. Click **Environment** tab
4. Add new environment variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://matka-api-server.onrender.com`
5. Click **Save Changes**
6. Service will auto-redeploy with new environment variables

## After Setting Environment Variables

- A new build will start automatically
- Wait for deployment to complete (~5-10 minutes)
- Hard refresh browser: **Ctrl + Shift + R**
- Test login and DELETE user functionality

## Troubleshooting

If you still see `/api/api/` in URLs:
1. Check that Render shows the correct VITE_API_URL value
2. Hard refresh your browser cache
3. Check Network tab in DevTools to verify outgoing request URL
4. Wait for redeploy to complete

## Current Status
- Code: ✅ Updated and pushed (commit 068421c)
- Render Environment Variable: ⏳ Needs manual configuration
