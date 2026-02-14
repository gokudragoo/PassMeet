const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud";

/** Public IPFS gateways as fallbacks when primary times out */
const FALLBACK_GATEWAYS = [
  "https://ipfs.io",
  "https://cloudflare-ipfs.com",
  "https://dweb.link",
];

const FETCH_TIMEOUT_MS = 3000;

export interface EventMetadata {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  image: string;
  organizer: string;
  capacity: number;
  price: number;
  createdAt: string;
}

export interface EventsIndex {
  events: string[];
  lastUpdated: string;
}

const EVENTS_INDEX_NAME = "passmeet_events_index";

export async function uploadToIPFS(data: object, name: string): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error("Pinata JWT not configured");
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: data,
      pinataMetadata: {
        name,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload to IPFS: ${error}`);
  }

  const result = await response.json();
  return result.IpfsHash;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFromIPFS<T>(cid: string): Promise<T | null> {
  const gateways = [GATEWAY_URL, ...FALLBACK_GATEWAYS];
  for (const base of gateways) {
    try {
      const url = `${base}/ipfs/${cid}`;
      const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!response.ok) continue;
      return await response.json();
    } catch (error) {
      if (base === GATEWAY_URL) {
        console.warn("IPFS fetch failed (primary), trying fallback:", (error as Error)?.message ?? error);
      }
      continue;
    }
  }
  console.error("Failed to fetch from IPFS (all gateways):", cid);
  return null;
}

export async function getEventsCID(): Promise<string | null> {
  if (!PINATA_JWT) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.pinata.cloud/data/pinList?metadata[name]=${EVENTS_INDEX_NAME}&status=pinned&pageLimit=1`,
      {
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.rows && data.rows.length > 0) {
      return data.rows[0].ipfs_pin_hash;
    }
    return null;
  } catch (error) {
    console.error("Failed to get events CID:", error);
    return null;
  }
}

export async function unpinFromIPFS(cid: string): Promise<void> {
  if (!PINATA_JWT) return;

  try {
    await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });
  } catch (error) {
    console.error("Failed to unpin:", error);
  }
}

export async function saveEventMetadata(event: EventMetadata): Promise<string | null> {
  if (!PINATA_JWT) {
    return null;
  }

  const eventCID = await uploadToIPFS(event, `passmeet_event_${event.id}`);
  
  const existingIndexCID = await getEventsCID();
  let eventsIndex: EventsIndex = {
    events: [],
    lastUpdated: new Date().toISOString(),
  };

  if (existingIndexCID) {
    const existingIndex = await fetchFromIPFS<EventsIndex>(existingIndexCID);
    if (existingIndex) {
      eventsIndex = existingIndex;
    }
    await unpinFromIPFS(existingIndexCID);
  }

  if (!eventsIndex.events.includes(eventCID)) {
    eventsIndex.events.push(eventCID);
  }
  eventsIndex.lastUpdated = new Date().toISOString();

  await uploadToIPFS(eventsIndex, EVENTS_INDEX_NAME);

  return eventCID;
}

export async function getAllEvents(): Promise<EventMetadata[]> {
  const indexCID = await getEventsCID();
  if (!indexCID) {
    return [];
  }

  const index = await fetchFromIPFS<EventsIndex>(indexCID);
  if (!index || !index.events?.length) {
    return [];
  }

  const results = await Promise.all(
    index.events.map((cid) => fetchFromIPFS<EventMetadata>(cid))
  );
  return results.filter((e): e is EventMetadata => e != null);
}
