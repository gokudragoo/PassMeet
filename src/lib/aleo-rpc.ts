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

function stripNetworkSuffix(base: string): string {
  const trimmed = (base || "").replace(/\/+$/, "");
  const suffix = `/${ALEO_NETWORK}`;
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
}

function provableBaseCandidates(base: string): string[] {
  const trimmed = stripNetworkSuffix((base || "").replace(/\/+$/, ""));
  const candidates: string[] = [];

  // Many env examples use /v2, but mapping reads are stable on /v1.
  // Prefer /v1 first when /v2 is configured.
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
      const baseNoNetwork = stripNetworkSuffix(base);
      const url = `${baseNoNetwork}/${ALEO_NETWORK}/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`;
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

        // Some Provable variants (notably /v2) can return 200 + "null" even when /v1 has data.
        // Continue to the next base candidate before giving up.
        continue;
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

const RPC_RETRY_DELAY_MS = 5000;

/**
 * Fetches the current event counter from the passmeet contract.
 * The event_counter mapping uses key 0u8 and returns the latest event ID (u64).
 * Retries up to 2 times with 5s delay when null, to handle transient Provable indexing lag.
 */
export async function getEventCounter(): Promise<number> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RPC_RETRY_DELAY_MS));
    const text = await fetchMappingValue(PASSMEET_V1_PROGRAM_ID, "event_counter", "0u8");
    if (text) {
      const match = text.match(/(\d+)u64/);
      const count = match ? parseInt(match[1], 10) : 0;
      if (process.env.NODE_ENV === "development") {
        console.log("[PassMeet RPC] getEventCounter:", count);
      }
      return count;
    }
    if (attempt < 2 && process.env.NODE_ENV === "development") {
      console.log("[PassMeet RPC] getEventCounter: no data, retrying in 5s...");
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.log("[PassMeet RPC] getEventCounter: no data after retries, returning 0");
  }
  return 0;
}

/** Fetch latest block height from Provable explorer REST. Returns null on failure. */
export async function getLatestBlockHeight(): Promise<number | null> {
  const bases = provableBaseCandidates(ALEO_RPC_URL);
  for (const base of bases) {
    try {
      const baseNoNetwork = stripNetworkSuffix(base);
      const url = `${baseNoNetwork}/${ALEO_NETWORK}/block/height/latest`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;

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
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetches a single event from the on-chain events mapping.
 * Retries up to 2 times with 5s delay when null, to handle transient Provable indexing lag.
 */
export async function getEvent(eventId: number): Promise<OnChainEventInfo | null> {
  const key = `${eventId}u64`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RPC_RETRY_DELAY_MS));
    const text = await fetchMappingValue(PASSMEET_V1_PROGRAM_ID, "events", key);
    if (text) {
      try {
        const parsed = parseEventInfo(text, eventId);
        if (process.env.NODE_ENV === "development") {
          console.log("[PassMeet RPC] getEvent:", eventId, "->", parsed ? "ok" : "null");
        }
        return parsed;
      } catch {
        return null;
      }
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.log("[PassMeet RPC] getEvent:", eventId, "-> null (after retries)");
  }
  return null;
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
