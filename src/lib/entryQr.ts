import { z } from "zod";

export const ENTRY_QR_PREFIX = "passmeet://entry/";

export const entryQrPayloadSchema = z.object({
  version: z.literal(1),
  type: z.literal("passmeet-entry"),
  network: z.string().min(1),
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
  eventName: z.string().min(1),
  date: z.string(),
  location: z.string(),
  txHash: z.string().optional(),
  generatedAt: z.string().datetime(),
});

export type EntryQrPayload = z.infer<typeof entryQrPayloadSchema>;

function toBase64Url(input: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  if (typeof globalThis.btoa !== "function") {
    throw new Error("Base64 encoding is not available in this environment.");
  }

  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  if (typeof globalThis.atob === "function") {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Base64 decoding is not available in this environment.");
}

export function buildEntryQrPayload(input: Omit<EntryQrPayload, "version" | "type" | "generatedAt">): EntryQrPayload {
  return {
    version: 1,
    type: "passmeet-entry",
    generatedAt: new Date().toISOString(),
    ...input,
  };
}

export function encodeEntryQrPayload(payload: EntryQrPayload): string {
  return `${ENTRY_QR_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function createGateLink(encodedPayload: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/gate?entry=${encodeURIComponent(encodedPayload)}`;
}

export function decodeEntryQrPayload(raw: string): EntryQrPayload | null {
  if (!raw) return null;

  let candidate = raw.trim();
  if (!candidate) return null;

  try {
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      const url = new URL(candidate);
      candidate = url.searchParams.get("entry") ?? candidate;
    }

    if (candidate.startsWith(ENTRY_QR_PREFIX)) {
      candidate = fromBase64Url(candidate.slice(ENTRY_QR_PREFIX.length));
    }

    const parsed = JSON.parse(candidate);
    return entryQrPayloadSchema.parse(parsed);
  } catch {
    return null;
  }
}
