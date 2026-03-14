/**
 * Generate a strong PASSMEET_AUTH_SECRET and (optionally) write it to .env.local.
 *
 * Usage:
 *   node scripts/generate_auth_secret.mjs
 *   node scripts/generate_auth_secret.mjs --no-env
 *   node scripts/generate_auth_secret.mjs --force
 */

import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const NO_ENV = argv.includes("--no-env") || process.env.NO_ENV === "1";
const FORCE = argv.includes("--force") || process.env.FORCE === "1";

function isPlaceholder(secret) {
  return (
    !secret ||
    secret === "please_change_me_to_a_random_32_char_secret" ||
    secret === "your_random_32_char_secret_here" ||
    secret === "please_change_me"
  );
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

async function main() {
  const secret = crypto.randomBytes(32).toString("base64url"); // 43 chars, URL-safe
  console.log("\n✅ Generated PASSMEET_AUTH_SECRET:\n");
  console.log(secret);
  console.log("");

  if (NO_ENV) {
    console.log("⏭️  Skipped writing .env.local (--no-env).");
    return;
  }

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, "..");
  const envLocal = path.join(repoRoot, ".env.local");

  let existing = "";
  try {
    existing = await readFile(envLocal, "utf8");
  } catch {
    // ignore
  }
  const match = existing.match(/^PASSMEET_AUTH_SECRET=(.*)$/m);
  const current = match ? match[1].trim() : "";

  if (!FORCE && current && !isPlaceholder(current) && current.length >= 32) {
    console.log("ℹ️  .env.local already has a non-placeholder PASSMEET_AUTH_SECRET. Use --force to overwrite.");
    return;
  }

  await upsertEnvVar(envLocal, "PASSMEET_AUTH_SECRET", secret);
  console.log("✅ Wrote PASSMEET_AUTH_SECRET to .env.local");
}

main().catch((e) => {
  console.error("❌ Failed to generate secret:", e?.message ?? e);
  process.exit(1);
});

