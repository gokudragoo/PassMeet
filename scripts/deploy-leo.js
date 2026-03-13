#!/usr/bin/env node
/**
 * Deploy Leo contracts to Aleo testnet. Requires Leo CLI and funded account.
 * Cross-platform (Windows, macOS, Linux).
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dirs = ["contracts/passmeet_v1_7788", "contracts/passmeet_subs_7788"];

for (const dir of dirs) {
  const fullPath = path.join(root, dir);
  console.log(`Deploying ${dir}...`);
  try {
    execSync("leo deploy --network testnet", { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Deploy failed for ${dir}.`);
    process.exit(1);
  }
}
console.log("All contracts deployed.");
