#!/usr/bin/env node
/**
 * Deploy Leo contracts to Aleo. Requires Leo CLI and a funded account.
 * Cross-platform (Windows, macOS, Linux).
 *
 * Usage:
 *   NETWORK=testnet PRIVATE_KEY="APrivateKey1..." node scripts/deploy-leo.js
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dirs = ["contracts/passmeet_v1_7788", "contracts/passmeet_subs_7788"];

const network = process.env.NETWORK || process.env.ALEO_NETWORK || "testnet";
const privateKey = process.env.PRIVATE_KEY || process.env.ALEO_PRIVATE_KEY || "";

function leoSupportsPrivateKeyDeploy() {
  try {
    const help = execSync("leo deploy --help", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return help.includes("--private-key");
  } catch {
    return false;
  }
}

const supportsPrivateKey = privateKey ? leoSupportsPrivateKeyDeploy() : false;

for (const dir of dirs) {
  const fullPath = path.join(root, dir);
  console.log(`Building ${dir}...`);
  try {
    execSync("leo build", { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Build failed for ${dir}.`);
    process.exit(1);
  }

  console.log(`Deploying ${dir} (network=${network})...`);
  const deployCmd = supportsPrivateKey
    ? `leo deploy --network ${network} --private-key ${privateKey}`
    : `leo deploy --network ${network}`;
  if (privateKey && !supportsPrivateKey) {
    console.warn("Warning: leo deploy does not advertise --private-key; deploying with Leo's configured account.");
  }
  try {
    execSync(deployCmd, { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Deploy failed for ${dir}.`);
    process.exit(1);
  }
}

console.log("All contracts deployed.");
