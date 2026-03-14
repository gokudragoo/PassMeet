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
const endpoint = process.env.ENDPOINT || process.env.ALEO_ENDPOINT || "https://api.explorer.provable.com/v1";

// Leo prints `.env` values when not quiet; default to quiet to avoid leaking secrets.
const leoQuiet = process.env.LEO_VERBOSE === "1" ? "" : "-q ";

function leoSupportsPrivateKeyDeploy() {
  try {
    const help = execSync("leo deploy --help", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return help.includes("--private-key");
  } catch {
    return false;
  }
}

const supportsPrivateKey = privateKey ? leoSupportsPrivateKeyDeploy() : false;
const supportsEndpoint = endpoint ? (() => {
  try {
    const help = execSync("leo deploy --help", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return help.includes("--endpoint");
  } catch {
    return false;
  }
})() : false;

for (const dir of dirs) {
  const fullPath = path.join(root, dir);
  console.log(`Building ${dir}...`);
  try {
    execSync(`leo ${leoQuiet}build`, { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Build failed for ${dir}.`);
    process.exit(1);
  }

  console.log(`Deploying ${dir} (network=${network})...`);
  const maybePrivateKey = supportsPrivateKey ? ` --private-key ${privateKey}` : "";
  const maybeEndpoint = supportsEndpoint ? ` --endpoint ${endpoint}` : "";
  const deployCmd = `leo ${leoQuiet}deploy --broadcast --network ${network}${maybePrivateKey}${maybeEndpoint}`;
  if (privateKey && !supportsPrivateKey) {
    console.warn("Warning: leo deploy does not advertise --private-key; deploying with Leo's configured account.");
  }
  if (endpoint && !supportsEndpoint) {
    console.warn("Warning: leo deploy does not advertise --endpoint; deploying with Leo's default endpoint.");
  }
  try {
    execSync(deployCmd, { cwd: fullPath, stdio: "inherit" });
  } catch {
    console.error(`Deploy failed for ${dir}.`);
    process.exit(1);
  }
}

console.log("All contracts deployed.");
