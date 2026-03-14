type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

// Best-effort in-memory rate limiting.
// Note: In serverless, this is per-instance and resets on cold starts.
const buckets = new Map<string, Bucket>();

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim() || "unknown";
  return "unknown";
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true; remaining: number; resetAt: number } | { ok: false; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    const next: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { ok: true, remaining: Math.max(0, limit - next.count), resetAt: next.resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);
  const remaining = Math.max(0, limit - existing.count);
  if (existing.count > limit) return { ok: false, remaining, resetAt: existing.resetAt };
  return { ok: true, remaining, resetAt: existing.resetAt };
}

export function rateLimitHeaders(limit: number, remaining: number, resetAt: number): HeadersInit {
  const retryAfterSec = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt),
    "Retry-After": String(retryAfterSec),
  };
}

