# Matka Admin Panel

A React-based admin dashboard for the Matka application.

## Quick Start

### Development
```bash
npm install
npm run dev
```
Then open http://localhost:5173

### Production Build
```bash
npm run build
npm run preview
```

## Environment Setup

Create `.env` file:
```env
VITE_API_URL=https://api.your-domain.com
```

## Deployment

### Option 1: Vercel (Recommended)
1. Push this directory to GitHub
2. Import repository on vercel.com
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add environment variable: `VITE_API_URL`
6. Deploy!

### Option 2: Netlify
1. Connect GitHub repository
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variable: `VITE_API_URL`
5. Deploy!

### Option 3: Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## Configuration

### API Endpoint
Set `VITE_API_URL` environment variable to your API server URL:
- Development: `http://localhost:4000`
- Production: `https://api.your-domain.com`

## Features
- React 18
- Vite build system
- TypeScript support
- Tailwind CSS
- Radix UI components
- React Hook Form
- React Router

## Directory Structure
```
├── src/
│   ├── components/    # React components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom hooks
│   ├── lib/           # Utility functions
│   ├── App.tsx
│   └── main.tsx
├── public/            # Static files
├── dist/              # Build output
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Support

For bugs and feature requests, create an issue in the main repository:
https://github.com/Mukeem001/matkaapp
