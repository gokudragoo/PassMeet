/**
 * Quick check: Are the PassMeet USDCx and USAD tokens registered on testnet?
 * 
 * Usage: node scripts/check_tokens.mjs
 */

const API_URL = "https://api.explorer.provable.com/v1";
const NETWORK = "testnet";

const USDCX_TOKEN_ID = "7788001field";
const USAD_TOKEN_ID = "7788002field";

function cleanMappingText(raw) {
  let cleaned = (raw ?? "").trim();
  if (!cleaned || cleaned === "null") return "";
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  return cleaned.trim();
}

function parseField(text, key) {
  const m = (text ?? "").match(new RegExp(`${key}:\\s*([^,\\n}]+)`));
  return m ? m[1].trim() : null;
}

async function checkToken(tokenId, label) {
  try {
    const url = `${API_URL}/${NETWORK}/program/token_registry.aleo/mapping/registered_tokens/${tokenId}`;
    const res = await fetch(url);
    if (res.ok) {
      const raw = await res.text();
      const text = cleanMappingText(raw);
      if (text) {
        const supply = parseField(text, "supply") ?? "<unknown>";
        const decimals = parseField(text, "decimals") ?? "<unknown>";
        const admin = parseField(text, "admin") ?? "<unknown>";
        console.log(`✅ ${label} (${tokenId}): REGISTERED (supply=${supply}, decimals=${decimals})`);
        console.log(`   admin: ${admin}`);
        return true;
      }
    }
    console.log(`❌ ${label} (${tokenId}): NOT REGISTERED`);
    return false;
  } catch (e) {
    console.log(`⚠️  ${label} (${tokenId}): Error checking - ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("\n🔍 Checking PassMeet Token Registration on Aleo Testnet\n");
  
  const usdcx = await checkToken(USDCX_TOKEN_ID, "USDCx");
  const usad = await checkToken(USAD_TOKEN_ID, "USAD");
  
  console.log("\n---");
  if (usdcx && usad) {
    console.log("✅ Both tokens are registered! Your .env should have:");
    console.log(`   NEXT_PUBLIC_USDCX_TOKEN_ID=${USDCX_TOKEN_ID}`);
    console.log(`   NEXT_PUBLIC_USAD_TOKEN_ID=${USAD_TOKEN_ID}`);
  } else {
    console.log("⚠️  One or both tokens are not registered yet.");
    console.log("   Run: node scripts/register_and_mint_tokens.mjs <YOUR_PRIVATE_KEY>");
  }
  console.log("");
}

main();
