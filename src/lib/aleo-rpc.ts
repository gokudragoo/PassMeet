import { ALEO_RPC_URL, PASSMEET_V1_PROGRAM_ID } from "./aleo";

const ALEO_JSON_RPC = "https://testnet3.aleorpc.com";

export interface OnChainEventInfo {
  id: number;
  organizer: string;
  capacity: number;
  ticket_count: number;
  price: number;
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
  try {
    const url = `${ALEO_RPC_URL}/testnet/program/${programId}/mapping/${mappingName}/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

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
    }
  } catch (error) {
    console.error(`Provable fetch failed for ${mappingName}/${key}:`, error);
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
 * The API returns Aleo struct notation like:
 *   { id: 1u64, organizer: aleo1..., capacity: 2u32, ticket_count: 0u32, price: 100000u64 }
 */
function parseEventInfo(raw: string, eventId: number): OnChainEventInfo | null {
  const trimmed = raw.trim();

  // Use regex to extract fields from Aleo struct notation
  const idMatch = trimmed.match(/id:\s*(\d+)u64/);
  const organizerMatch = trimmed.match(/organizer:\s*(aleo1[a-z0-9]+)/);
  const capacityMatch = trimmed.match(/capacity:\s*(\d+)u32/);
  const ticketCountMatch = trimmed.match(/ticket_count:\s*(\d+)u32/);
  const priceMatch = trimmed.match(/price:\s*(\d+)u64/);

  if (!capacityMatch || !priceMatch) return null;

  return {
    id: idMatch ? parseInt(idMatch[1], 10) : eventId,
    organizer: organizerMatch ? organizerMatch[1] : "",
    capacity: parseInt(capacityMatch[1], 10),
    ticket_count: ticketCountMatch ? parseInt(ticketCountMatch[1], 10) : 0,
    price: parseInt(priceMatch[1], 10),
  };
}
