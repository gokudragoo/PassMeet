import { ALEO_RPC_URL, PASSMEET_V1_PROGRAM_ID } from "./aleo";

const ALEO_JSON_RPC = "https://testnet3.aleorpc.com";

export interface OnChainEventInfo {
  id: number;
  organizer: string;
  capacity: number;
  ticket_count: number;
  price: number;
}

async function fetchMappingValue(mappingName: string, key: string): Promise<string | null> {
  const provableUrl = `${ALEO_RPC_URL}/program/${PASSMEET_V1_PROGRAM_ID}/mapping/${mappingName}/${encodeURIComponent(key)}`;
  const response = await fetch(provableUrl);
  if (response.ok) {
    const text = await response.text();
    if (text?.trim()) return text.trim();
  }

  const rpcResponse = await fetch(ALEO_JSON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getMappingValue",
      params: {
        program_id: PASSMEET_V1_PROGRAM_ID,
        mapping_name: mappingName,
        key
      }
    })
  });
  const json = await rpcResponse.json();
  return json?.result ?? null;
}

/**
 * Fetches the current event counter from the passmeet contract.
 * The event_counter mapping uses key 0u8 and returns the latest event ID (u64).
 */
export async function getEventCounter(): Promise<number> {
  const text = await fetchMappingValue("event_counter", "0u8");
  if (!text) return 0;
  const match = text.match(/(\d+)u64/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Fetches a single event from the on-chain events mapping.
 */
export async function getEvent(eventId: number): Promise<OnChainEventInfo | null> {
  const key = `${eventId}u64`;
  const text = await fetchMappingValue("events", key);
  if (!text) return null;
  try {
    return parseEventInfo(text, eventId);
  } catch {
    return null;
  }
}

/**
 * Parses Aleo EventInfo struct string into OnChainEventInfo.
 * Format may vary: could be JSON or Aleo struct notation.
 */
function parseEventInfo(raw: string, eventId: number): OnChainEventInfo | null {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        id: parsed.id ?? eventId,
        organizer: parsed.organizer ?? "",
        capacity: parseInt(parsed.capacity, 10) || 0,
        ticket_count: parseInt(parsed.ticket_count, 10) || 0,
        price: parseInt(parsed.price, 10) || 0,
      };
    } catch {
      // Fall through to regex parsing
    }
  }

  const idMatch = trimmed.match(/id:\s*(\d+)u64/);
  const organizerMatch = trimmed.match(/organizer:\s*([a-z0-9]+\.private|aleo1[a-z0-9]+)/);
  const capacityMatch = trimmed.match(/capacity:\s*(\d+)u32/);
  const ticketCountMatch = trimmed.match(/ticket_count:\s*(\d+)u32/);
  const priceMatch = trimmed.match(/price:\s*(\d+)u64/);

  if (!capacityMatch || !ticketCountMatch || !priceMatch) return null;

  return {
    id: idMatch ? parseInt(idMatch[1], 10) : eventId,
    organizer: organizerMatch ? organizerMatch[1].replace(".private", "") : "",
    capacity: parseInt(capacityMatch[1], 10),
    ticket_count: parseInt(ticketCountMatch[1], 10),
    price: parseInt(priceMatch[1], 10),
  };
}
