import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "../..");

async function buildAll() {
  console.log("🚀 Building API Server with dependencies...\n");
  
  try {
    // Step 1: Build lib/api-zod
    console.log("📦 Building lib/api-zod...");
    execSync("npm run build", {
      cwd: path.join(rootDir, "lib/api-zod"),
      stdio: "inherit",
    });
    
    // Step 2: Build lib/db
    console.log("\n📚 Building lib/db...");
    execSync("npm run build", {
      cwd: path.join(rootDir, "lib/db"),
      stdio: "inherit",
    });
    
    // Step 3: Build api-server
    console.log("\n⚙️  Building api-server...");
    execSync("npx tsc --build tsconfig.json", {
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
