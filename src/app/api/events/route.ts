import { NextResponse } from "next/server";

const LOG = (msg: string, data?: unknown) => {
  console.log(`[PassMeet API] ${msg}`, data ?? "");
};

export async function GET() {
  LOG("GET /api/events: returning empty (no IPFS)");
  return NextResponse.json({ events: [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    LOG("POST /api/events: no-op", { id: body.id, name: body.name });
    const eventId = body.id != null ? String(body.id) : `event_${Date.now()}`;
    return NextResponse.json({
      success: true,
      cid: null,
      event: { id: eventId, ...body },
      ipfsSaved: false,
    });
  } catch (error) {
    LOG("POST /api/events: error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
