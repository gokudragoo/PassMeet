import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPassMeetAuthSecret, PASSMEET_SESSION_COOKIE, verifyToken, type SignedTokenPayload } from "@/lib/auth";

export const runtime = "nodejs";

type SessionPayload = SignedTokenPayload & {
  address: string;
  iat: number;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSMEET_SESSION_COOKIE)?.value ?? null;
  if (!token) return NextResponse.json({ authenticated: false });

  try {
    const secret = getPassMeetAuthSecret();
    const res = verifyToken<SessionPayload>(token, secret);
    if ("error" in res) {
      cookieStore.delete(PASSMEET_SESSION_COOKIE);
      return NextResponse.json({ authenticated: false });
    }
    if (!res.payload.address || typeof res.payload.address !== "string") {
      cookieStore.delete(PASSMEET_SESSION_COOKIE);
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      address: res.payload.address,
      exp: res.payload.exp,
    });
  } catch {
    cookieStore.delete(PASSMEET_SESSION_COOKIE);
    return NextResponse.json({ authenticated: false });
  }
}

