import { ALEO_RPC_URL, PASSMEET_V1_PROGRAM_ID } from "./aleo";

export interface OnChainEventInfo {
  id: number;
  organizer: string;
  capacity: number;
  ticket_count: number;
  price: number;
}

/**
 * Fetches the current event counter from the passmeet contract.
 * The event_counter mapping uses key 0u8 and returns the latest event ID (u64).
 */
export async function getEventCounter(): Promise<number> {
  const key = "0u8";
  const url = `${ALEO_RPC_URL}/program/${PASSMEET_V1_PROGRAM_ID}/mapping/event_counter/${encodeURIComponent(key)}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return 0;
    throw new Error(`Failed to fetch event counter: ${response.statusText}`);
  }

  const text = await response.text();
  if (!text || text.trim() === "") return 0;

  const match = text.match(/(\d+)u64/);
  if (match) return parseInt(match[1], 10);
  return 0;
}

/**
 * Fetches a single event from the on-chain events mapping.
 */
export async function getEvent(eventId: number): Promise<OnChainEventInfo | null> {
  const key = `${eventId}u64`;
  const url = `${ALEO_RPC_URL}/program/${PASSMEET_V1_PROGRAM_ID}/mapping/events/${encodeURIComponent(key)}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch event ${eventId}: ${response.statusText}`);
  }

  const text = await response.text();
  if (!text || text.trim() === "") return null;

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
