# Hostinger Deployment Checklist

## Pre-Deployment Verification ✅

- [x] JWT secrets removed from code (hardcoded fallback removed)
- [x] SSL certificate verification enabled for production
- [x] .env.example created with all required variables
- [x] .env.production template created
- [x] Build scripts tested and working
- [x] .gitignore updated to exclude .env files
- [x] Package.json configured for monorepo
- [x] Procfile configured for Hostinger

## Environment Setup Required on Hostinger

### 1. Create PostgreSQL Database
- Host: [Hostinger database host]
- Database: matka_db
- User: [your username]
- Password: [strong password]

### 2. Set Environment Variables on Hostinger
These must be set in Hostinger's environment settings or .env file:

```env
DATABASE_URL=postgresql://user:password@host:5432/matka_db
PORT=4000
NODE_ENV=production
JWT_SECRET=[strong-random-32-char-value]
FRONTEND_URL=https://your-domain.com
FRONTEND_URL_WWW=https://www.your-domain.com
APP_URL=https://api.your-domain.com
APP_BASE_URL=https://api.your-domain.com
```

### 3. Configure Hostinger Node.js Application
- **Runtime:** Node.js 18+
- **Entry Point:** npm start
- **Build Command:** npm run build
- **Install Command:** npm install

## Deployment Steps

1. **Connect Repository on Hostinger**
   - Go to Hosting → Websites
   - Add New Website → Node.js
   - Select Repository: matkaapp
   - Authorize GitHub if needed

2. **Configure Environment Variables**
   - Add all variables from section 2 above
   - Ensure DATABASE_URL points to your PostgreSQL database

3. **Deploy**
   - Hostinger will:
     - Pull code from GitHub
     - Run `npm install`
     - Run `npm run build`
     - Start with `npm start`

4. **Verify Deployment**
   - Check logs for build errors
   - Test API endpoints
   - Verify database connection

## Health Checks

- API Health: `GET /api/health`
- Check logs for JWT_SECRET errors
- Verify database connectivity
- Check CORS headers for frontend domain

## Troubleshooting

### Build Failed
- Check Node.js version (needs 18+)
- Review build logs for TypeScript errors
- Ensure DATABASE_URL is not required during build

### JWT Errors
- Verify JWT_SECRET environment variable is set
- Secret must be 32+ characters
- Restart application after changing

### Database Connection Failed
- Verify DATABASE_URL is correct
- Check if database server is running
- Ensure network access from Hostinger IP

### CORS Errors
- Add domain to FRONTEND_URL in .env
- Verify production domain matches env variable
