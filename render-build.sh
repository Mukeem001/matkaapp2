#!/usr/bin/env bash
set -e


echo "🚀 Starting Render build..."

echo "📦 Installing dependencies (including devDependencies)..."
npm install --legacy-peer-deps --include=dev

echo "🔨 Building TypeScript..."
NODE_ENV=production npx tsc --build tsconfig.json

echo "🗄️ Running database migrations..."
cd lib/db
npm run push

echo "✅ Build completed successfully!"
