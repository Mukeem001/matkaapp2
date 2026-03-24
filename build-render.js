#!/usr/bin/env node

/**
 * Build script for Render deployment
 * Installs all dependencies and builds with TypeScript project references
 */

const { execSync } = require("child_process");

function run(cmd, cwd = process.cwd()) {
  console.log(`\n📦 Running: ${cmd}\n`);
  try {
    execSync(cmd, { cwd, stdio: "inherit" });
  } catch (err) {
    console.error(`❌ Command failed: ${cmd}`);
    process.exit(1);
  }
}

console.log("🚀 Starting Render build process...\n");

// Step 1: Install all dependencies
console.log("📥 Installing dependencies...");
run("npm install");

// Step 2: Build with TypeScript project references
console.log("\n🔨 Building with TypeScript...");
run("npm run build:monorepo");

console.log("\n✅ Build complete!\n");

