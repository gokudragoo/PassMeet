import { NextResponse } from "next/server";
import { saveEventMetadata, getAllEvents, EventMetadata } from "@/lib/pinata";

const LOG = (msg: string, data?: unknown) => {
  console.log(`[PassMeet API] ${msg}`, data ?? "");
};

let eventsCache: { events: EventMetadata[]; ts: number } | null = null;
const CACHE_TTL_MS = 15_000; // 15 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (eventsCache && now - eventsCache.ts < CACHE_TTL_MS) {
      LOG("GET /api/events: cache hit", { count: eventsCache.events.length });
      return NextResponse.json({ events: eventsCache.events });
    }
    LOG("GET /api/events: fetching...");
    const events = await getAllEvents();
    eventsCache = { events, ts: Date.now() };
    LOG("GET /api/events: done", { count: events?.length ?? 0 });
    return NextResponse.json({ events });
  } catch (error) {
    LOG("GET /api/events: error", error);
    console.error("Failed to fetch events:", error);
    return NextResponse.json({ events: [], error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    LOG("POST /api/events: saving metadata", { id: body.id, name: body.name });

    const eventId = body.id != null ? String(body.id) : `event_${Date.now()}`;

    const event: EventMetadata = {
      id: eventId,
      name: body.name,
      description: body.description || "",
      date: body.date,
      location: body.location,
      image: body.image || `https://images.unsplash.com/photo-1540575861501-7ad05823c95b?q=80&w=800&auto=format&fit=crop`,
      organizer: body.organizer ?? "",
      capacity: body.capacity ?? 0,
      price: body.price ?? 0,
      createdAt: new Date().toISOString(),
    };

    const cid = await saveEventMetadata(event);
    LOG("POST /api/events: IPFS saved", { eventId, cid: cid ?? "null" });
    eventsCache = null; // invalidate cache so new event appears

    return NextResponse.json({
      success: true,
      cid: cid ?? null,
      event,
      ipfsSaved: cid != null,
    });
  } catch (error) {
    LOG("POST /api/events: error", error);
    console.error("Failed to create event:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create event" 
    }, { status: 500 });
  }
}
