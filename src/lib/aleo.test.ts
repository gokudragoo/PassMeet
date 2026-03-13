import { describe, it, expect } from "vitest";
import {
  isOnChainTxHash,
  getTransactionUrl,
  getProgramUrl,
  PASSMEET_V1_PROGRAM_ID,
} from "./aleo";

describe("aleo", () => {
  describe("isOnChainTxHash", () => {
    it("returns true for valid at1 hash with 61+ chars", () => {
      const valid =
        "at1lkxmqgcxqy8df6tqsue26pn9qpq49pvtep6c62sm4dmjxq7y6cxsr6uuxs";
      expect(isOnChainTxHash(valid)).toBe(true);
    });
    it("returns false for temp UUID", () => {
      expect(isOnChainTxHash("d8f2dae9-1234-5678-90ab-cdef12345678")).toBe(
        false
      );
    });
    it("returns false for short at1 string", () => {
      expect(isOnChainTxHash("at1short")).toBe(false);
    });
    it("returns false for non-at1 prefix", () => {
      expect(isOnChainTxHash("at2lkxmqgcxqy8df6tqsue26pn9qpq49pvtep6c62sm4dmjxq7y6cxsr6uuxs")).toBe(false);
    });
  });

  describe("getTransactionUrl", () => {
    it("returns null for invalid hash", () => {
      expect(getTransactionUrl("invalid")).toBe(null);
    });
    it("returns explorer URL for valid at1 hash", () => {
      const hash =
        "at1lkxmqgcxqy8df6tqsue26pn9qpq49pvtep6c62sm4dmjxq7y6cxsr6uuxs";
      const url = getTransactionUrl(hash);
      expect(url).toContain("/transaction/");
      expect(url).toContain(hash);
    });
  });

  describe("getProgramUrl", () => {
    it("returns URL containing program id", () => {
      const url = getProgramUrl(PASSMEET_V1_PROGRAM_ID);
      expect(url).toContain("/program/");
      expect(url).toContain("passmeet_v1");
    });
  });
});
