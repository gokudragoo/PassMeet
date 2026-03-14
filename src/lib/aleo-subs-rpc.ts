import { ALEO_NETWORK, ALEO_RPC_URL, PASSMEET_SUBS_PROGRAM_ID } from "./aleo";

// Optional JSON-RPC fallback for mapping reads. Provable Explorer REST is the primary path.
// Leave unset unless you have a compatible Aleo JSON-RPC endpoint.
const ALEO_JSON_RPC = process.env.NEXT_PUBLIC_ALEO_JSON_RPC || "";
const PROVABLE_V1_FALLBACK = "https://api.explorer.provable.com/v1";
const REST_TIMEOUT_MS = 8000;

function uniqueStrings(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const v = (it || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function stripNetworkSuffix(base: string): string {
  const trimmed = (base || "").replace(/\/+$/, "");
  const suffix = `/${ALEO_NETWORK}`;
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
}

function provableBaseCandidates(base: string): string[] {
  const trimmed = stripNetworkSuffix((base || "").replace(/\/+$/, ""));
  const candidates: string[] = [];
  const v1 = trimmed.replace(/\/v2$/, "/v1");
  if (v1 !== trimmed) candidates.push(v1);
  candidates.push(trimmed);
  candidates.push(PROVABLE_V1_FALLBACK);
  return uniqueStrings(candidates.map(stripNetworkSuffix));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export interface OnChainSubscription {
  tier: number;
  start_height: number;
  end_height: number;
}

async function fetchSubsMappingValue(mappingName: string, key: string): Promise<string | null> {
  const bases = provableBaseCandidates(ALEO_RPC_URL);
  for (const base of bases) {
    try {
      const baseNoNetwork = stripNetworkSuffix(base);
      const url = `${baseNoNetwork}/${ALEO_NETWORK}/program/${PASSMEET_SUBS_PROGRAM_ID}/mapping/${mappingName}/${encodeURIComponent(key)}`;
      const response = await fetchWithTimeout(url);

      if (response.ok) {
        const text = await response.text();
        if (text && text.trim() !== "null") {
          let cleaned = text.trim();
          if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
            cleaned = cleaned.slice(1, -1);
          }
          cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"');
          if (cleaned) return cleaned;
        }
        continue;
      }

      if (process.env.NODE_ENV === "development") {
        console.warn(`[PassMeet RPC] subs mapping fetch failed (${response.status})`, { url });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[PassMeet RPC] subs mapping fetch error`, { base, mappingName, key, error });
      }
    }
  }

  if (!ALEO_JSON_RPC) return null;
  try {
    const response = await fetch(ALEO_JSON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMappingValue",
        params: {
          program_id: PASSMEET_SUBS_PROGRAM_ID,
          mapping_name: mappingName,
          key,
        },
      }),
    });
    const json = await response.json();
    const result = json?.result;
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.error("JSON-RPC fallback failed for user_subs:", error);
    return null;
  }
}

/**
 * Fetches subscription for an address from passmeet_subs_7788.aleo.
 * Returns null if no subscription or RPC fails.
 * tier: 0=Free, 1=Organizer Pro, 2=Enterprise
 */
export async function getSubscription(
  address: string
): Promise<OnChainSubscription | null> {
  const text = await fetchSubsMappingValue("user_subs", address);
  if (!text) return null;

  const tierMatch = text.match(/tier:\s*(\d+)u8/);
  const startHeightMatch = text.match(/start_height:\s*(\d+)u32/);
  const endHeightMatch = text.match(/end_height:\s*(\d+)u32/);
  const legacyExpiryMatch = text.match(/expiry:\s*(\d+)u32/);

  if (!tierMatch) return null;

  return {
    tier: parseInt(tierMatch[1], 10),
    start_height: startHeightMatch ? parseInt(startHeightMatch[1], 10) : 0,
    end_height: endHeightMatch ? parseInt(endHeightMatch[1], 10) : (legacyExpiryMatch ? parseInt(legacyExpiryMatch[1], 10) : 0),
  };
}

export async function getSubscriptionTreasury(): Promise<string | null> {
  const text = await fetchSubsMappingValue("treasury", "0u8");
  if (!text) return null;
  const m = text.match(/(aleo1[a-z0-9]+)/);
  return m ? m[1] : null;
}

export async function getSubscriptionTokenId(key: 0 | 1): Promise<string | null> {
  const text = await fetchSubsMappingValue("token_ids", `${key}u8`);
  if (!text) return null;
  const m = text.match(/(\d+)field/);
  return m ? `${m[1]}field` : null;
}
