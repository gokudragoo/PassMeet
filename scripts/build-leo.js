#!/usr/bin/env node
/**
 * Build Leo contracts. Requires Leo CLI: https://docs.leo-lang.org/
 * Cross-platform (Windows, macOS, Linux).
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dirs = ["contracts/passmeet_v1_7788", "contracts/passmeet_subs_7788"];

for (const dir of dirs) {
  const fullPath = path.join(root, dir);
  console.log(`Building ${dir}...`);
  try {
    execSync("leo build", { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Failed to build ${dir}. Is Leo CLI installed? Run: leo --version`);
    process.exit(1);
  }
}
console.log("All contracts built successfully.");
