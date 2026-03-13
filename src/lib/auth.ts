import crypto from "crypto";

export const PASSMEET_NONCE_COOKIE = "passmeet_nonce";
export const PASSMEET_SESSION_COOKIE = "passmeet_session";

export type SignedTokenPayload = Record<string, unknown> & {
  exp: number; // epoch ms
};

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function base64UrlDecodeToBuffer(data: string): Buffer {
  return Buffer.from(data, "base64url");
}

function hmacSha256Base64Url(secret: string, msg: string): string {
  return crypto.createHmac("sha256", secret).update(msg, "utf8").digest("base64url");
}

export function getPassMeetAuthSecret(): string {
  const secret =
    process.env.PASSMEET_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Auth secret not configured (PASSMEET_AUTH_SECRET, min 32 chars).");
  }
  return secret;
}

export function signToken(payload: SignedTokenPayload, secret: string): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const sigB64 = hmacSha256Base64Url(secret, payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export function verifyToken<TPayload extends SignedTokenPayload>(
  token: string,
  secret: string
): { payload: TPayload } | { error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { error: "Invalid token format" };
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { error: "Invalid token format" };

  const expectedSigB64 = hmacSha256Base64Url(secret, payloadB64);
  const sigBuf = base64UrlDecodeToBuffer(sigB64);
  const expectedBuf = base64UrlDecodeToBuffer(expectedSigB64);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { error: "Invalid token signature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString("utf8"));
  } catch {
    return { error: "Invalid token payload" };
  }
  if (!payload || typeof payload !== "object") return { error: "Invalid token payload" };

  const exp = (payload as { exp?: unknown }).exp;
  if (typeof exp !== "number") return { error: "Token missing exp" };
  if (Date.now() > exp) return { error: "Token expired" };

  return { payload: payload as TPayload };
}

