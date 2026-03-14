import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getPassMeetAuthSecret,
  PASSMEET_NONCE_COOKIE,
  PASSMEET_SESSION_COOKIE,
  signToken,
  verifyToken,
  type SignedTokenPayload,
} from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type NoncePayload = SignedTokenPayload & {
  address: string;
  nonce: string;
  message: string;
};

type SessionPayload = SignedTokenPayload & {
  address: string;
  iat: number;
};

async function getSdk() {
  const network = process.env.NEXT_PUBLIC_ALEO_NETWORK || "testnet";
  if (network === "mainnet") return import("@provablehq/sdk/mainnet.js");
  return import("@provablehq/sdk/testnet.js");
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`auth:verify:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait and try again." },
      { status: 429, headers: rateLimitHeaders(20, rl.remaining, rl.resetAt) }
    );
  }
  const cookieStore = await cookies();
  try {
    const { address, signatureBase64 } = (await request.json()) as {
      address?: unknown;
      signatureBase64?: unknown;
    };
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }
    if (!signatureBase64 || typeof signatureBase64 !== "string") {
      return NextResponse.json({ error: "signatureBase64 required" }, { status: 400 });
    }

    const nonceToken = cookieStore.get(PASSMEET_NONCE_COOKIE)?.value;
    if (!nonceToken) {
      return NextResponse.json({ error: "No nonce found. Request a new one." }, { status: 401 });
    }

    const secret = getPassMeetAuthSecret();
    const nonceRes = verifyToken<NoncePayload>(nonceToken, secret);
    if ("error" in nonceRes) {
      cookieStore.delete(PASSMEET_NONCE_COOKIE);
      return NextResponse.json({ error: nonceRes.error }, { status: 401 });
    }

    if (nonceRes.payload.address !== address) {
      return NextResponse.json({ error: "Address mismatch" }, { status: 401 });
    }

    const { Address, Signature } = await getSdk();

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = Buffer.from(signatureBase64, "base64");
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    let signature: ReturnType<typeof Signature.fromBytesLe>;
    try {
      signature = Signature.fromBytesLe(signatureBytes);
    } catch {
      return NextResponse.json({ error: "Invalid signature bytes" }, { status: 400 });
    }

    let aleoAddress: ReturnType<typeof Address.from_string>;
    try {
      aleoAddress = Address.from_string(address);
    } catch {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const msgBytes = new TextEncoder().encode(nonceRes.payload.message);
    const ok = aleoAddress.verify(msgBytes, signature);
    if (!ok) {
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }

    cookieStore.delete(PASSMEET_NONCE_COOKIE);

    const sessionPayload: SessionPayload = {
      address,
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
    };
    const sessionToken = signToken(sessionPayload, secret);
    cookieStore.set(PASSMEET_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PassMeet Auth] verify error:", error);
    cookieStore.delete(PASSMEET_NONCE_COOKIE);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
