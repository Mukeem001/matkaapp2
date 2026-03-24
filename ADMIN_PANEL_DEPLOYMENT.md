# Matka Admin Panel - Standalone Deployment Guide

## For Vercel Deployment

### 1. Create separate repository for admin-panel
```bash
cd artifacts/admin-panel
git init
git remote add origin https://github.com/YOUR_USERNAME/matka-admin-panel.git
git add .
git commit -m "initial: matka admin panel"
git push -u origin main
```

### 2. Deploy on Vercel
- Go to vercel.com
- Import repository
- Select `artifacts/admin-panel` as root directory
- Add environment variable: `VITE_API_URL=https://api.your-api-domain.com`
- Deploy

### 3. Configure environment
Create `.env.production`:
```
VITE_API_URL=https://api.your-domain.com
VITE_APP_Title=Matka Admin Panel
```

## For Local Development

```bash
cd artifacts/admin-panel
npm install
npm run dev
```

## Build for Production

```bash
cd artifacts/admin-panel
npm run build
npm run preview
```

## Deployment Architecture

```
Repository Structure:
├── Main Repo (matkaapp)
│   ├── artifacts/api-server → Deploy to Hostinger
│   ├── lib/db
│   └── lib/api-zod
│
└── Separate Repo (matka-admin-panel)
    └── Deploy to Vercel/Netlify
```

Both deployments should communicate via:
- **Admin Panel** → calls `VITE_API_URL`
- **API Server** → CORS configured for admin panel domain
