#!/bin/bash
# Script to validate VITE_API_URL environment variable

echo "🔍 Checking VITE_API_URL configuration..."

if [ -z "$VITE_API_URL" ]; then
  echo "❌ ERROR: VITE_API_URL environment variable is not set!"
  echo "ℹ️  Set it in Render Dashboard → Environment"
  exit 1
fi

if [[ "$VITE_API_URL" == *"/api"* ]]; then
  echo "⚠️  WARNING: VITE_API_URL should NOT include '/api' prefix"
  echo "Current value: $VITE_API_URL"
  echo "Expected: https://matka-api-server.onrender.com (without /api)"
  echo "This will cause invalid URLs like /api/api/auth/login"
  exit 1
fi

echo "✅ VITE_API_URL is correctly set: $VITE_API_URL"
echo "✅ Building with correct API endpoint..."
