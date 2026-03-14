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

function normalizeBase64(input: string): string {
  const s = (input ?? "").trim();
  // Accept base64url inputs too.
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  return pad === 0 ? b64 : b64 + "=".repeat(4 - pad);
}

function tryDecodeSignatureBytes(signatureBase64: string): Uint8Array | null {
  try {
    return Buffer.from(normalizeBase64(signatureBase64), "base64");
  } catch {
    return null;
  }
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
      if (process.env.NODE_ENV === "development") {
        console.warn("[PassMeet Auth] verify: no nonce cookie");
      }
      return NextResponse.json(
        {
          error: "Session expired. Please sign in again.",
          ...(process.env.NODE_ENV === "development" && { code: "no_nonce" }),
        },
        { status: 401 }
      );
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

    // Wallets differ in signature encoding:
    // - Some return raw signature bytes (Signature.toBytesLe()).
    // - Some return bytes of the signature string (e.g. "sign1..."), which must be parsed with Signature.from_string.
    // We accept both for interoperability.
    let signature: ReturnType<typeof Signature.fromBytesLe> | null = null;
    const sigBytes = tryDecodeSignatureBytes(signatureBase64);

    if (sigBytes && sigBytes.length > 0) {
      try {
        signature = Signature.fromBytesLe(sigBytes);
      } catch {
        // try parse as string stored in bytes
        try {
          const sigText = new TextDecoder().decode(sigBytes).trim();
          if (sigText.startsWith("sign")) {
            signature = Signature.from_string(sigText);
          }
        } catch {
          // ignore and fall through to error below
        }
      }
    } else if (signatureBase64.trim().startsWith("sign")) {
      // Some clients may send the signature string directly.
      try {
        signature = Signature.from_string(signatureBase64.trim());
      } catch {
        // fall through
      }
    }

    if (!signature) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[PassMeet Auth] verify: invalid signature format");
      }
      return NextResponse.json(
        {
          error: "Signature format not supported. Try a different wallet.",
          ...(process.env.NODE_ENV === "development" && { code: "invalid_signature" }),
        },
        { status: 400 }
      );
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
      if (process.env.NODE_ENV === "development") {
        console.warn("[PassMeet Auth] verify: signature verification failed");
      }
      return NextResponse.json(
        {
          error: "Signature did not verify. Ensure you're signing the exact message.",
          ...(process.env.NODE_ENV === "development" && { code: "signature_verification_failed" }),
        },
        { status: 401 }
      );
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
