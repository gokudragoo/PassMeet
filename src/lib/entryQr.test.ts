import { describe, expect, it } from "vitest";
import { buildEntryQrPayload, createGateLink, decodeEntryQrPayload, encodeEntryQrPayload } from "@/lib/entryQr";

describe("entryQr", () => {
  it("encodes and decodes a passmeet entry payload", () => {
    const payload = buildEntryQrPayload({
      network: "testnet",
      eventId: "2",
      ticketId: "7",
      eventName: "WaveHack Privacy Night",
      date: "2026-03-26",
      location: "Bengaluru",
      txHash: "at1lkxmqgcxqy8df6tqsue26pn9qpq49pvtep6c62sm4dmjxq7y6cxsr6uuxs",
    });

    const encoded = encodeEntryQrPayload(payload);
    expect(encoded.startsWith("passmeet://entry/")).toBe(true);
    expect(decodeEntryQrPayload(encoded)).toEqual(payload);
  });

  it("decodes a gate link", () => {
    const payload = buildEntryQrPayload({
      network: "testnet",
      eventId: "11",
      ticketId: "3",
      eventName: "Aleo Builder Day",
      date: "2026-03-27",
      location: "Remote",
    });

    const encoded = encodeEntryQrPayload(payload);
    const link = createGateLink(encoded, "https://passmeet.test");
    expect(decodeEntryQrPayload(link)).toEqual(payload);
  });

  it("returns null for invalid payloads", () => {
    expect(decodeEntryQrPayload("invalid")).toBeNull();
    expect(decodeEntryQrPayload("passmeet://entry/not-json")).toBeNull();
  });
});
