import { ALEO_RPC_URL, PASSMEET_V1_PROGRAM_ID } from "./aleo";

export interface OnChainEventInfo {
  id: number;
  organizer: string;
  capacity: number;
  ticket_count: number;
  price: number;
}

/**
 * Fetches a mapping value from the Aleo Provable explorer API.
 * The API returns values as quoted strings, e.g. "\"1u64\"" or "\"{...}\"".
 */
async function fetchMappingValue(mappingName: string, key: string): Promise<string | null> {
  try {
    const url = `${ALEO_RPC_URL}/testnet/program/${PASSMEET_V1_PROGRAM_ID}/mapping/${mappingName}/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    const text = await response.text();
    if (!text || text.trim() === "null") return null;

    // The API wraps the value in quotes, e.g. "\"1u64\"" — strip them
    let cleaned = text.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    // Unescape inner quotes and newlines
    cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"');

    return cleaned || null;
  } catch (error) {
    console.error(`Failed to fetch mapping ${mappingName}/${key}:`, error);
    return null;
  }
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
