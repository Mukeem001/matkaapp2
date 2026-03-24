# Matka Admin Panel - Node.js Application

This is a monorepo-based Express.js API server for the Matka Admin Panel.

## Project Structure

- `artifacts/api-server/` - Main Express.js API server
- `lib/api-zod/` - Zod validation schemas
- `lib/db/` - Database (Drizzle ORM) configuration
- `server.js` - Root entry point for Hostinger

## Requirements

- Node.js 18+
- PostgreSQL database
- Environment variables (see .env.production)

## Deployment on Hostinger

### 1. Repository Connection
- GitHub repository: `https://github.com/Mukeem001/matkaapp.git`
- Branch: `main`

### 2. Environment Variables (Required)
```
DATABASE_URL=postgresql://user:password@host:5432/matka_db
JWT_SECRET=your-secret-key-min-32-chars
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://your-domain.com
```

### 3. Build & Start
- Build: `npm run build`
- Start: `npm start` or `node server.js`
- Procfile: Configured automatically

### 4. Database Setup
- Create PostgreSQL database
- Run migrations if needed

## Troubleshooting

**"Unsupported framework" error:**
- Check that Node.js 18+ is selected
- Verify package.json is at root
- Ensure server.js exists

**Build fails:**
- Check DATABASE_URL environment variable
- Ensure all Node.js dependencies are specified

**Runtime errors:**
- Check logs in Hostinger control panel
- Verify JWT_SECRET is set
- Check database connectivity
