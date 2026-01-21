import { NextResponse } from "next/server";
import { saveEventMetadata, getAllEvents, EventMetadata } from "@/lib/pinata";

export async function GET() {
  try {
    const events = await getAllEvents();
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return NextResponse.json({ events: [], error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const event: EventMetadata = {
      id: body.id || `event_${Date.now()}`,
      name: body.name,
      description: body.description || "",
      date: body.date,
      location: body.location,
      image: body.image || `https://images.unsplash.com/photo-1540575861501-7ad05823c95b?q=80&w=800&auto=format&fit=crop`,
      organizer: body.organizer,
      capacity: body.capacity,
      price: body.price,
      createdAt: new Date().toISOString(),
    };

    const cid = await saveEventMetadata(event);
    
    return NextResponse.json({ 
      success: true, 
      cid,
      event 
    });
  } catch (error) {
    console.error("Failed to create event:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create event" 
    }, { status: 500 });
  }
}
