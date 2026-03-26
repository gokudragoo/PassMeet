import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPassMeetAuthSecret, PASSMEET_SESSION_COOKIE, verifyToken, type SignedTokenPayload } from "@/lib/auth";
import { getAllResaleListings, saveResaleListing, type ResaleListingMetadata } from "@/lib/pinata";
import { dedupeLatestResaleListings, resaleListingSchema, sortResaleListings } from "@/lib/resale";

type SessionPayload = SignedTokenPayload & { address: string };

async function requireSession(): Promise<{ address: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSMEET_SESSION_COOKIE)?.value ?? null;
  if (!token) return null;
  try {
    const secret = getPassMeetAuthSecret();
    const res = verifyToken<SessionPayload>(token, secret);
    if ("error" in res || !res.payload.address) return null;
    return { address: res.payload.address };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const listings = dedupeLatestResaleListings(await getAllResaleListings());
    return NextResponse.json({ listings: sortResaleListings(listings) });
  } catch (error) {
    return NextResponse.json(
      { listings: [], error: error instanceof Error ? error.message : "Failed to fetch resale listings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in to manage resale listings." }, { status: 401 });
  }

  if (!process.env.PINATA_JWT) {
    return NextResponse.json(
      { success: false, error: "Resale listing storage is disabled until PINATA_JWT is configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const listing = resaleListingSchema.parse(body) as ResaleListingMetadata;
    const existingListings = dedupeLatestResaleListings(await getAllResaleListings());
    const existing = existingListings.find((item) => item.id === listing.id) ?? null;

    if (!existing) {
      if (listing.sellerAddress !== session.address || listing.status !== "open") {
        return NextResponse.json({ success: false, error: "Only the ticket owner can publish a new open listing." }, { status: 403 });
      }
    } else if (existing.sellerAddress === session.address) {
      if (listing.sellerAddress !== session.address) {
        return NextResponse.json({ success: false, error: "Seller address cannot be changed." }, { status: 403 });
      }
    } else {
      const buyerReserving =
        existing.status === "open" &&
        listing.status === "reserved" &&
        listing.sellerAddress === existing.sellerAddress &&
        listing.reservedFor === session.address;

      if (!buyerReserving) {
        return NextResponse.json({ success: false, error: "Only the seller can edit this listing, unless you are reserving an open order." }, { status: 403 });
      }

      const immutableChanged =
        listing.eventId !== existing.eventId ||
        listing.ticketId !== existing.ticketId ||
        listing.eventName !== existing.eventName ||
        listing.date !== existing.date ||
        listing.location !== existing.location ||
        JSON.stringify(listing.prices) !== JSON.stringify(existing.prices);
      if (immutableChanged) {
        return NextResponse.json({ success: false, error: "Reserved listings must keep the original ticket and pricing data unchanged." }, { status: 400 });
      }
    }

    await saveResaleListing(listing);
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save resale listing" },
      { status: 400 }
    );
  }
}
