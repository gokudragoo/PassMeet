const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud";

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

export async function fetchFromIPFS<T>(cid: string): Promise<T | null> {
  try {
    const response = await fetch(`${GATEWAY_URL}/ipfs/${cid}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch from IPFS:", error);
    return null;
  }
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
  if (!index) {
    return [];
  }

  const events: EventMetadata[] = [];
  for (const eventCID of index.events) {
    const event = await fetchFromIPFS<EventMetadata>(eventCID);
    if (event) {
      events.push(event);
    }
  }

  return events;
}
