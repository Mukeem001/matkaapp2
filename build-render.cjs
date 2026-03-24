#!/usr/bin/env node

/**
 * Build script for Render deployment
 * Builds each TypeScript package sequentially to ensure proper resolution
 */

const { execSync } = require("child_process");

function run(cmd, label = "") {
  console.log(`\n${label}\n📦 ${cmd}\n`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: __dirname });
  } catch (err) {
    console.error(`\n❌ Failed: ${cmd}`);
    process.exit(1);
  }
}

console.log("🚀 Starting Render build...\n");

// Step 1: Install dependencies
run("npm install --legacy-peer-deps", "📥 Step 1: Installing dependencies");

// Step 2: Build lib/api-zod (no dependencies on other packages)
run("tsc -p lib/api-zod/tsconfig.json --skipLibCheck", "🔒 Step 2: Building api-zod schemas");

// Step 3: Build lib/db (depends only on npm packages)
run("tsc -p lib/db/tsconfig.json --skipLibCheck", "📚 Step 3: Building database package");

// Step 4: Build api-server (depends on both lib packages)
run("tsc -p artifacts/api-server/tsconfig.json --skipLibCheck", "⚙️  Step 4: Building API server");

console.log("\n✅ Build complete!\n");




