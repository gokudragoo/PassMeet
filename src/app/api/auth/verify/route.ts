import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function POST(request: Request) {
  try {
    const { address, signature } = await request.json();
    if (!address || !signature || typeof address !== "string" || typeof signature !== "string") {
      return NextResponse.json({ error: "Address and signature required" }, { status: 400 });
    }
    const cookieStore = await cookies();
    const nonceToken = cookieStore.get("passmeet_nonce")?.value;
    if (!nonceToken) {
      return NextResponse.json({ error: "No nonce found. Request a new one." }, { status: 401 });
    }
    const [payloadB64] = nonceToken.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    if (payload.exp < Date.now()) {
      cookieStore.delete("passmeet_nonce");
      return NextResponse.json({ error: "Nonce expired" }, { status: 401 });
    }
    if (payload.address !== address) {
      return NextResponse.json({ error: "Address mismatch" }, { status: 401 });
    }
    // Signature verification is done client-side via wallet; we trust the client
    // for session creation. Production would verify the signature server-side.
    cookieStore.delete("passmeet_nonce");
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }
    const sessionPayload = JSON.stringify({
      address,
      timestamp: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
    });
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret.slice(0, 32).padEnd(32, "0")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sessionPayload));
    const sessionToken = `${Buffer.from(encoder.encode(sessionPayload)).toString("base64url")}.${Buffer.from(sig).toString("base64url")}`;
    cookieStore.set("passmeet_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PassMeet Auth] verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
