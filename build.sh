#!/bin/bash
set -e

echo "Installing dependencies with npm ci..."
npm ci

echo "Building TypeScript..."
npm run build

echo "Running database migrations..."
cd lib/db && npm run push

echo "Build completed successfully!"
