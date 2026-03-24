import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "../..");

async function buildAll() {
  console.log("🚀 Building API Server with dependencies...\n");
  
  try {
    // Step 0: Install root dependencies
    console.log("📦 Installing root dependencies...");
    execSync("npm install --legacy-peer-deps", {
      cwd: rootDir,
      stdio: "inherit",
    });
    
    // Step 1: Install and build lib/api-zod
    console.log("\n📦 Building lib/api-zod...");
    const apiZodDir = path.join(rootDir, "lib/api-zod");
    execSync("npm install --legacy-peer-deps", {
      cwd: apiZodDir,
      stdio: "inherit",
    });
    execSync("npm run build", {
      cwd: apiZodDir,
      stdio: "inherit",
    });
    
    // Step 2: Install and build lib/db
    console.log("\n📚 Building lib/db...");
    const dbDir = path.join(rootDir, "lib/db");
    execSync("npm install --legacy-peer-deps", {
      cwd: dbDir,
      stdio: "inherit",
    });
    execSync("npm run build", {
      cwd: dbDir,
      stdio: "inherit",
    });
    
    // Step 3: Install and build api-server
    console.log("\n⚙️  Building api-server...");
    execSync("npm install --legacy-peer-deps", {
      cwd: __dirname,
      stdio: "inherit",
    });
    execSync("npx tsc --build tsconfig.json --listFiles", {
      cwd: __dirname,
      stdio: "inherit",
    });
    
    console.log("\n✅ Build complete!\n");
  } catch (err) {
    console.error("❌ Build failed:", err);
    process.exit(1);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
