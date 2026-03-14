import { ALEO_NETWORK, ALEO_RPC_URL, PASSMEET_V1_PROGRAM_ID } from "./aleo";

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

function provableBaseCandidates(base: string): string[] {
  const trimmed = (base || "").replace(/\/+$/, "");
  const candidates = [trimmed];

  // Many examples use /v2 in env, but mapping reads are stable on /v1.
  // Try /v1 if /v2 is configured.
  const v1 = trimmed.replace(/\/v2$/, "/v1");
  if (v1 !== trimmed) candidates.push(v1);

  candidates.push(PROVABLE_V1_FALLBACK);
  return uniqueStrings(candidates);
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

export interface OnChainEventInfo {
  id: number;
  organizer: string;
  capacity: number;
  ticket_count: number;
  price: number;
  price_credits: number;
  price_usdcx: number;
  price_usad: number;
}

export async function getConfiguredTokenId(key: 0 | 1): Promise<string | null> {
  const text = await fetchMappingValue(PASSMEET_V1_PROGRAM_ID, "token_ids", `${key}u8`);
  if (!text) return null;
  const m = text.match(/(\d+)field/);
  return m ? `${m[1]}field` : null;
}

/**
 * Fetches a mapping value via JSON-RPC (getMappingValue).
 * Used as fallback when Provable REST fails.
 */
async function fetchMappingValueJsonRpc(
  programId: string,
  mappingName: string,
  key: string
): Promise<string | null> {
  if (!ALEO_JSON_RPC) return null;
  try {
    const response = await fetch(ALEO_JSON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMappingValue",
        params: { program_id: programId, mapping_name: mappingName, key },
      }),
    });
    const json = await response.json();
    const result = json?.result;
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.error(`JSON-RPC fallback failed for ${mappingName}/${key}:`, error);
    return null;
  }
}

/**
 * Fetches a mapping value from the Aleo Provable explorer API.
 * Falls back to JSON-RPC (testnet3.aleorpc.com) if Provable returns null.
 */
async function fetchMappingValue(
  programId: string,
  mappingName: string,
  key: string
): Promise<string | null> {
  const bases = provableBaseCandidates(ALEO_RPC_URL);
  for (const base of bases) {
    try {
      const url = `${base}/${ALEO_NETWORK}/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`;
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
        return null;
      }

      // Only log in dev; mapping reads are frequent and this can be noisy.
      if (process.env.NODE_ENV === "development") {
        console.warn(`[PassMeet RPC] mapping fetch failed (${response.status})`, { url });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[PassMeet RPC] mapping fetch error`, { base, programId, mappingName, key, error });
      }
    }
  }

  return fetchMappingValueJsonRpc(programId, mappingName, key);
}

/**
 * Fetches the current event counter from the passmeet contract.
 * The event_counter mapping uses key 0u8 and returns the latest event ID (u64).
 */
export async function getEventCounter(): Promise<number> {
  const text = await fetchMappingValue(PASSMEET_V1_PROGRAM_ID, "event_counter", "0u8");
  if (!text) {
    console.log("[PassMeet RPC] getEventCounter: no data, returning 0");
    return 0;
  }
  const match = text.match(/(\d+)u64/);
  const count = match ? parseInt(match[1], 10) : 0;
  console.log("[PassMeet RPC] getEventCounter:", count);
  return count;
}

/** Fetch latest block height from Provable explorer REST. Returns null on failure. */
export async function getLatestBlockHeight(): Promise<number | null> {
  try {
    const url = `${ALEO_RPC_URL}/${ALEO_NETWORK}/block/height/latest`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const text = await res.text();
    try {
      const data = JSON.parse(text) as unknown;
      if (typeof data === "number") return data;
      if (typeof data === "string") {
        const n = parseInt(data, 10);
        return Number.isFinite(n) ? n : null;
      }
    } catch {
      // fall through
    }

    const n = parseInt(text.replace(/\D/g, ""), 10);
    if (Number.isFinite(n)) return n;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches a single event from the on-chain events mapping.
 */
export async function getEvent(eventId: number): Promise<OnChainEventInfo | null> {
  const key = `${eventId}u64`;
  const text = await fetchMappingValue(PASSMEET_V1_PROGRAM_ID, "events", key);
  if (!text) {
    console.log("[PassMeet RPC] getEvent:", eventId, "-> null");
    return null;
  }
  try {
    const parsed = parseEventInfo(text, eventId);
    console.log("[PassMeet RPC] getEvent:", eventId, "->", parsed ? "ok" : "null");
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parses Aleo EventInfo struct string into OnChainEventInfo.
 * Supports both legacy (price) and new (price_credits, price_usdcx, price_usad) formats.
 */
function parseEventInfo(raw: string, eventId: number): OnChainEventInfo | null {
  const trimmed = raw.trim();

  const idMatch = trimmed.match(/id:\s*(\d+)u64/);
  const organizerMatch = trimmed.match(/organizer:\s*(aleo1[a-z0-9]+)/);
  const capacityMatch = trimmed.match(/capacity:\s*(\d+)u32/);
  const ticketCountMatch = trimmed.match(/ticket_count:\s*(\d+)u32/);
  const priceMatch = trimmed.match(/price:\s*(\d+)u64/);
  const priceCreditsMatch = trimmed.match(/price_credits:\s*(\d+)u128/);
  const priceUsdcxMatch = trimmed.match(/price_usdcx:\s*(\d+)u128/);
  const priceUsadMatch = trimmed.match(/price_usad:\s*(\d+)u128/);

  if (!capacityMatch) return null;

  const priceCredits = priceCreditsMatch ? parseInt(priceCreditsMatch[1], 10) : (priceMatch ? parseInt(priceMatch[1], 10) : 0);
  const priceUsdcx = priceUsdcxMatch ? parseInt(priceUsdcxMatch[1], 10) : 0;
  const priceUsad = priceUsadMatch ? parseInt(priceUsadMatch[1], 10) : 0;
  const price = priceMatch ? parseInt(priceMatch[1], 10) : priceCredits;

  return {
    id: idMatch ? parseInt(idMatch[1], 10) : eventId,
    organizer: organizerMatch ? organizerMatch[1] : "",
    capacity: parseInt(capacityMatch[1], 10),
    ticket_count: ticketCountMatch ? parseInt(ticketCountMatch[1], 10) : 0,
    price,
    price_credits: priceCredits,
    price_usdcx: priceUsdcx,
    price_usad: priceUsad,
  };
}
