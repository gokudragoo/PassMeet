/**
 * PassMeet Token Registration & Minting Script
 * 
 * This script:
 * 1. Registers USDCx test token on token_registry.aleo
 * 2. Registers USAD test token on token_registry.aleo  
 * 3. Mints test tokens to your wallet (private records)
 * 4. Updates .env/.env.local with token IDs (optional)
 * 
 * Usage:
 *   node scripts/register_and_mint_tokens.mjs <PRIVATE_KEY>
 *   PRIVATE_KEY=<PRIVATE_KEY> node scripts/register_and_mint_tokens.mjs
 *
 * Options:
 *   --no-env   Skip updating .env/.env.local
 *   --no-mint  Skip minting test tokens
 * 
 * Prerequisite: Your wallet must have testnet Aleo credits for fees.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use dynamic import for the SDK (ESM)
const argv = process.argv.slice(2);
const privateKeyArg = argv.find((a) => typeof a === "string" && a.startsWith("APrivateKey1"));
const PRIVATE_KEY = privateKeyArg || process.env.PRIVATE_KEY || process.env.ALEO_PRIVATE_KEY;
const NO_ENV = argv.includes("--no-env") || process.env.NO_ENV === "1";
const NO_MINT = argv.includes("--no-mint") || process.env.NO_MINT === "1";
if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("APrivateKey1")) {
  console.error("\n❌ Usage: node scripts/register_and_mint_tokens.mjs <YOUR_ALEO_PRIVATE_KEY>");
  console.error("   Your private key starts with APrivateKey1...\n");
  console.error("   Tip: PRIVATE_KEY=<key> node scripts/register_and_mint_tokens.mjs");
  console.error("   Flags: --no-env (don't touch .env files), --no-mint (register only)\n");
  process.exit(1);
}

// ----- Configuration -----
const API_URL = "https://api.explorer.provable.com/v1";
const NETWORK = "testnet";

// Unique token IDs for PassMeet (using project-specific values to avoid collisions)
const USDCX_TOKEN_ID = "7788001field";
const USAD_TOKEN_ID = "7788002field";

// Token names/symbols encoded as u128 (ASCII bytes packed into a big-endian u128).
function asciiToU128Literal(text) {
  const bytes = Buffer.from(text, "ascii");
  if (bytes.length === 0) throw new Error("Empty token name/symbol");
  if (bytes.length > 16) throw new Error(`Token name/symbol too long for u128: ${text}`);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return `${n}u128`;
}

const USDCX_NAME = asciiToU128Literal("USDCx");
const USDCX_SYMBOL = asciiToU128Literal("USDCx");
const USAD_NAME = asciiToU128Literal("USAD");
const USAD_SYMBOL = asciiToU128Literal("USAD");

const DECIMALS = "6u8";
const MAX_SUPPLY = "10000000000000000u128"; // 10 billion tokens (with 6 decimals)
const MINT_AMOUNT = "1000000000u128"; // 1000 tokens (with 6 decimals) for testing
const FEE = 0.5; // Aleo credits for tx fee

// ----- Helpers -----
async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForConfirmation(txId, maxWaitSec = 300) {
  console.log(`   ⏳ Waiting for confirmation (up to ${maxWaitSec}s)...`);
  const start = Date.now();
  while (Date.now() - start < maxWaitSec * 1000) {
    try {
      const res = await fetch(`${API_URL}/${NETWORK}/transaction/${txId}`);
      if (res.ok) {
        // v1 can return JSON or text depending on the route; treat HTTP 200 as "indexed/accepted".
        try {
          const data = await res.json();
          if (data && (data.type === "execute" || data.type === "deploy")) {
            console.log(`   ✅ Confirmed! Tx: ${txId}`);
            return true;
          }
        } catch {
          console.log(`   ✅ Confirmed! Tx: ${txId}`);
          return true;
        }
      }
    } catch {
      // not confirmed yet
    }
    process.stdout.write(".");
    await sleep(5000);
  }
  console.log(`\n   ⚠️  Timed out waiting for ${txId}. Check explorer manually.`);
  return false;
}

function cleanMappingText(raw) {
  let cleaned = (raw ?? "").trim();
  if (!cleaned || cleaned === "null") return "";
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  return cleaned.trim();
}

async function fetchRegisteredTokenText(tokenId) {
  try {
    const url = `${API_URL}/${NETWORK}/program/token_registry.aleo/mapping/registered_tokens/${tokenId}`;
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      return cleanMappingText(text);
    }
  } catch {
    // not found
  }
  return "";
}

async function checkTokenRegistered(tokenId) {
  return !!(await fetchRegisteredTokenText(tokenId));
}

function parseTokenAdmin(registeredTokenText) {
  const m = (registeredTokenText ?? "").match(/admin:\s*(aleo1[a-z0-9]+)/);
  return m ? m[1] : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function upsertEnvVar(filePath, key, value) {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }

  const line = `${key}=${value}`;
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  let next = content;
  if (re.test(next)) {
    next = next.replace(re, line);
  } else {
    if (next.length && !next.endsWith("\n")) next += "\n";
    next += `${line}\n`;
  }

  if (next !== content) {
    await writeFile(filePath, next, "utf8");
  }
}

async function updateEnvFiles(usdcxId, usadId) {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, "..");
  const envLocal = path.join(repoRoot, ".env.local");
  const envFile = path.join(repoRoot, ".env");

  // Always update .env.local (Next.js loads it by default).
  await upsertEnvVar(envLocal, "NEXT_PUBLIC_TOKEN_REGISTRY_PROGRAM_ID", "token_registry.aleo");
  await upsertEnvVar(envLocal, "NEXT_PUBLIC_USDCX_TOKEN_ID", usdcxId);
  await upsertEnvVar(envLocal, "NEXT_PUBLIC_USAD_TOKEN_ID", usadId);

  // Update .env only if it already exists.
  try {
    await readFile(envFile, "utf8");
    await upsertEnvVar(envFile, "NEXT_PUBLIC_TOKEN_REGISTRY_PROGRAM_ID", "token_registry.aleo");
    await upsertEnvVar(envFile, "NEXT_PUBLIC_USDCX_TOKEN_ID", usdcxId);
    await upsertEnvVar(envFile, "NEXT_PUBLIC_USAD_TOKEN_ID", usadId);
  } catch {
    // ignore if missing
  }
}

// ----- Main -----
async function main() {
  console.log("\n🚀 PassMeet Token Registration & Minting");
  console.log("=========================================\n");

  // Dynamic import of the SDK
  let Account, ProgramManager, AleoKeyProvider;
  try {
    const sdk = await import("@provablehq/sdk/testnet.js");
    Account = sdk.Account;
    ProgramManager = sdk.ProgramManager;
    AleoKeyProvider = sdk.AleoKeyProvider;
  } catch (e) {
    console.error("❌ Failed to import @provablehq/sdk/testnet.js. Make sure deps are installed: npm install");
    console.error(e.message);
    process.exit(1);
  }

  // Setup account
  let account;
  try {
    account = new Account({ privateKey: PRIVATE_KEY });
  } catch (e) {
    console.error("❌ Invalid private key.");
    process.exit(1);
  }
  const walletAddress = account.address().to_string();
  console.log(`📎 Wallet: ${walletAddress}`);
  console.log(`🌐 Network: ${NETWORK}`);
  console.log(`🔗 API (queries): ${API_URL}/${NETWORK}`);
  console.log(`🔗 API (tx submit): ${API_URL}\n`);

  // Setup program manager (Provable SDK)
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const programManager = new ProgramManager(API_URL, keyProvider);
  programManager.setAccount(account);

  function cacheKey(programName, functionName) {
    return `${programName.replace(/\\.aleo$/, "")}:${functionName}`;
  }

  async function exec(programName, functionName, inputs) {
    const txId = await programManager.execute({
      programName,
      functionName,
      priorityFee: 0.0,
      privateFee: false,
      inputs,
      keySearchParams: { cacheKey: cacheKey(programName, functionName) },
    });
    if (typeof txId !== "string" || !txId.startsWith("at1")) {
      throw new Error(`Unexpected tx id: ${String(txId)}`);
    }
    return txId;
  }

  // ============================
  // Step 1: Check if tokens already registered
  // ============================
  console.log("📋 Step 1: Checking if tokens are already registered...\n");

  const usdcxText = await fetchRegisteredTokenText(USDCX_TOKEN_ID);
  const usadText = await fetchRegisteredTokenText(USAD_TOKEN_ID);
  const usdcxExists = !!usdcxText;
  const usadExists = !!usadText;

  // If a token ID was already registered by another admin, we cannot mint it.
  let canMintUsdcx = true;
  let canMintUsad = true;

  if (usdcxExists) {
    console.log(`   ✅ USDCx (${USDCX_TOKEN_ID}) is already registered!`);
    const admin = parseTokenAdmin(usdcxText);
    if (admin && admin !== walletAddress) {
      canMintUsdcx = false;
      console.log(`   ⚠️  USDCx admin is ${admin}. Minting will be skipped (not your token).`);
    }
  }
  if (usadExists) {
    console.log(`   ✅ USAD (${USAD_TOKEN_ID}) is already registered!`);
    const admin = parseTokenAdmin(usadText);
    if (admin && admin !== walletAddress) {
      canMintUsad = false;
      console.log(`   ⚠️  USAD admin is ${admin}. Minting will be skipped (not your token).`);
    }
  }

  // If registration happens in this run, refresh mint permissions afterward.
  async function refreshMintPermissions() {
    const [newUsdcxText, newUsadText] = await Promise.all([
      fetchRegisteredTokenText(USDCX_TOKEN_ID),
      fetchRegisteredTokenText(USAD_TOKEN_ID),
    ]);
    const usdcxAdmin = parseTokenAdmin(newUsdcxText);
    const usadAdmin = parseTokenAdmin(newUsadText);
    canMintUsdcx = !usdcxAdmin || usdcxAdmin === walletAddress;
    canMintUsad = !usadAdmin || usadAdmin === walletAddress;
  }

  // ============================
  // Step 2: Register USDCx
  // ============================
  if (!usdcxExists) {
    console.log(`\n📝 Step 2a: Registering USDCx token (${USDCX_TOKEN_ID})...`);
    try {
      const inputs = [
        USDCX_TOKEN_ID,   // token_id
        USDCX_NAME,       // name
        USDCX_SYMBOL,     // symbol
        DECIMALS,          // decimals
        MAX_SUPPLY,        // max_supply
        "false",           // external_authorization_required
        walletAddress,     // admin
      ];
      console.log("   Inputs:", inputs);

      const txId = await exec("token_registry.aleo", "register_token", inputs);

      console.log(`   📤 Submitted! TxID: ${txId}`);
      await waitForConfirmation(txId);
      await refreshMintPermissions();
    } catch (e) {
      console.error(`   ❌ Failed to register USDCx:`, e.message);
      if (e.message?.includes("already")) {
        console.log("   ℹ️  Token may already be registered. Continuing...");
      } else {
        console.error("   Full error:", e);
      }
    }
  }

  // ============================
  // Step 3: Register USAD  
  // ============================
  if (!usadExists) {
    console.log(`\n📝 Step 2b: Registering USAD token (${USAD_TOKEN_ID})...`);
    try {
      const inputs = [
        USAD_TOKEN_ID,    // token_id
        USAD_NAME,        // name
        USAD_SYMBOL,      // symbol
        DECIMALS,         // decimals
        MAX_SUPPLY,       // max_supply
        "false",          // external_authorization_required
        walletAddress,    // admin
      ];
      console.log("   Inputs:", inputs);

      const txId = await exec("token_registry.aleo", "register_token", inputs);

      console.log(`   📤 Submitted! TxID: ${txId}`);
      await waitForConfirmation(txId);
      await refreshMintPermissions();
    } catch (e) {
      console.error(`   ❌ Failed to register USAD:`, e.message);
      if (e.message?.includes("already")) {
        console.log("   ℹ️  Token may already be registered. Continuing...");
      } else {
        console.error("   Full error:", e);
      }
    }
  }

  // ============================
  // Step 4: Mint USDCx to self
  // ============================
  if (!NO_MINT && canMintUsdcx) {
    console.log(`\n💰 Step 3a: Minting ${MINT_AMOUNT} USDCx to your wallet...`);
    try {
      const inputs = [
        USDCX_TOKEN_ID,   // token_id
        walletAddress,     // receiver  
        MINT_AMOUNT,       // amount
      ];
      console.log("   Inputs:", inputs);

      const txId = await exec("token_registry.aleo", "mint_private", inputs);

      console.log(`   📤 Submitted! TxID: ${txId}`);
      await waitForConfirmation(txId);
    } catch (e) {
      console.error(`   ❌ Failed to mint USDCx:`, e.message);
      console.error("   This might happen if the token isn't registered yet (tx still confirming).");
      console.error("   Wait a few minutes and re-run the script.");
    }
  } else if (NO_MINT) {
    console.log("\n⏭️  Step 3a: Skipping USDCx mint (--no-mint).");
  } else {
    console.log("\n⏭️  Step 3a: Skipping USDCx mint (token is registered but not controlled by this wallet).");
  }

  // ============================
  // Step 5: Mint USAD to self
  // ============================
  if (!NO_MINT && canMintUsad) {
    console.log(`\n💰 Step 3b: Minting ${MINT_AMOUNT} USAD to your wallet...`);
    try {
      const inputs = [
        USAD_TOKEN_ID,    // token_id
        walletAddress,    // receiver
        MINT_AMOUNT,      // amount
      ];
      console.log("   Inputs:", inputs);

      const txId = await exec("token_registry.aleo", "mint_private", inputs);

      console.log(`   📤 Submitted! TxID: ${txId}`);
      await waitForConfirmation(txId);
    } catch (e) {
      console.error(`   ❌ Failed to mint USAD:`, e.message);
      console.error("   This might happen if the token isn't registered yet (tx still confirming).");
      console.error("   Wait a few minutes and re-run the script.");
    }
  } else if (NO_MINT) {
    console.log("\n⏭️  Step 3b: Skipping USAD mint (--no-mint).");
  } else {
    console.log("\n⏭️  Step 3b: Skipping USAD mint (token is registered but not controlled by this wallet).");
  }

  // ============================
  // Summary
  // ============================
  console.log("\n\n=========================================");
  console.log("📋 DONE!");
  console.log("=========================================\n");
  console.log("Required env vars:");
  console.log(`  NEXT_PUBLIC_USDCX_TOKEN_ID=${USDCX_TOKEN_ID}`);
  console.log(`  NEXT_PUBLIC_USAD_TOKEN_ID=${USAD_TOKEN_ID}`);
  console.log("  NEXT_PUBLIC_TOKEN_REGISTRY_PROGRAM_ID=token_registry.aleo");

  if (!NO_ENV) {
    try {
      await updateEnvFiles(USDCX_TOKEN_ID, USAD_TOKEN_ID);
      console.log("\n✅ Updated .env.local (and .env if present) with the token IDs.");
    } catch (e) {
      console.log("\n⚠️  Could not update .env files automatically:", e?.message ?? e);
      console.log("   Please set the env vars manually.");
    }
  } else {
    console.log("\n⏭️  Skipped .env updates (--no-env).");
  }
  console.log("");
  console.log("Then configure token rails on-chain:");
  console.log("  1. Go to /organizer page → Click 'Configure' button");
  console.log("  2. Go to /subscription page → Click 'Configure Subscriptions' button");
  console.log("  (Or call configure_tokens / configure via Shield wallet)");
  console.log("");
  console.log("Explorer links:");
  console.log(`  USDCx: https://testnet.explorer.provable.com/program/token_registry.aleo`);
  console.log(`  USAD:  https://testnet.explorer.provable.com/program/token_registry.aleo`);
  console.log("");
}

main().catch(e => {
  console.error("\n💥 Unhandled error:", e);
  process.exit(1);
});
