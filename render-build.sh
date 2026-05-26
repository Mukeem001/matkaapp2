#!/bin/bash
set -e

echo "🚀 Starting Render build..."

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

echo "🔨 Building TypeScript..."
npm run build

echo "🗄️ Running database migrations..."
cd lib/db
npm run push

echo "✅ Build completed successfully!"
