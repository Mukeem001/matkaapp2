#!/bin/bash
# Hostinger Deployment Script - Monorepo Build
set -e

echo "🚀 Starting Hostinger Deployment..."

# Step 1: Install all dependencies
echo "📦 Installing root dependencies..."
npm install

# Step 2: Build all workspace packages using TypeScript project references
echo "🔨 Building workspace packages..."
npm run build:deps

# Step 3: Build API Server
echo "🔨 Building API Server..."
npm run build:api

echo "✅ Deployment ready! API server is in artifacts/api-server/dist"
