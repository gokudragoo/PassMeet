import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getPassMeetAuthSecret,
  PASSMEET_NONCE_COOKIE,
  signToken,
  type SignedTokenPayload,
} from "@/lib/auth";

export const runtime = "nodejs";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 min

type NoncePayload = SignedTokenPayload & {
  address: string;
  nonce: string;
  message: string;
};

export async function POST(request: Request) {
  try {
    const { address } = (await request.json()) as { address?: unknown };
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const nonce = crypto.randomUUID();
    const message = `PassMeet Authentication\nNonce: ${nonce}\nTimestamp: ${Date.now()}\nAddress: ${address}`;
    const payload: NoncePayload = {
      address,
      nonce,
      message,
      exp: Date.now() + NONCE_TTL_MS,
    };

    const secret = getPassMeetAuthSecret();
    const token = signToken(payload, secret);

    const cookieStore = await cookies();
    cookieStore.set(PASSMEET_NONCE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(NONCE_TTL_MS / 1000),
      path: "/",
    });

    return NextResponse.json({ nonce, message });
  } catch (error) {
    console.error("[PassMeet Auth] nonce error:", error);
    return NextResponse.json({ error: "Failed to issue nonce" }, { status: 500 });
  }
}
