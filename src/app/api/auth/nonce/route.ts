import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }
    const nonce = crypto.randomUUID();
    const payload = JSON.stringify({ address, nonce, exp: Date.now() + NONCE_TTL_MS });
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret.slice(0, 32).padEnd(32, "0")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const token = `${Buffer.from(encoder.encode(payload)).toString("base64url")}.${Buffer.from(sig).toString("base64url")}`;
    const cookieStore = await cookies();
    cookieStore.set("passmeet_nonce", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300,
      path: "/",
    });
    const message = `PassMeet Authentication\nNonce: ${nonce}\nTimestamp: ${Date.now()}\nAddress: ${address}`;
    return NextResponse.json({ nonce, message });
  } catch (error) {
    console.error("[PassMeet Auth] nonce error:", error);
    return NextResponse.json({ error: "Failed to issue nonce" }, { status: 500 });
  }
}
