import { describe, expect, it } from "vitest";
import {
  createResaleListingId,
  dedupeLatestResaleListings,
  formatResalePrice,
  getActiveResaleRails,
  hasResalePrice,
  type ResaleListing,
} from "@/lib/resale";

describe("resale helpers", () => {
  it("detects enabled rails", () => {
    const prices = { credits: 1.5, usdcx: 0, usad: 8 };
    expect(getActiveResaleRails(prices)).toEqual(["credits", "usad"]);
    expect(hasResalePrice(prices)).toBe(true);
  });

  it("formats resale prices", () => {
    expect(formatResalePrice({ credits: 2, usdcx: 0, usad: 0 }, "credits")).toBe("2 Aleo Credits");
  });

  it("creates stable listing ids", () => {
    expect(createResaleListingId("1", "2")).toContain("resale_1_2_");
  });

  it("dedupes listings by latest update", () => {
    const older: ResaleListing = {
      id: "listing_1",
      eventId: "1",
      ticketId: "2",
      eventName: "PassMeet",
      date: "2026-03-26",
      location: "Bengaluru",
      sellerAddress: "aleo1seller",
      status: "open",
      prices: { credits: 1, usdcx: 0, usad: 0 },
      createdAt: "2026-03-26T10:00:00.000Z",
      updatedAt: "2026-03-26T10:00:00.000Z",
    };
    const newer: ResaleListing = {
      ...older,
      status: "reserved",
      updatedAt: "2026-03-26T11:00:00.000Z",
    };

    expect(dedupeLatestResaleListings([older, newer])).toEqual([newer]);
  });
});
