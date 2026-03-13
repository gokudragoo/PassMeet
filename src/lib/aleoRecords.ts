/** Parse microcredits amount from a credits.aleo record (string or object). Returns null if not found. */
export function getMicrocreditsFromCreditsRecord(recordItem: unknown): number | null {
  try {
    const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
    const match = str.match(/microcredits["\s:]+(\d+)u64/);
    if (match) return parseInt(match[1], 10);
    const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
    const data = (record as { data?: unknown; plaintext?: unknown })?.data ?? (record as { plaintext?: unknown })?.plaintext ?? record;
    const raw = (data as { microcredits?: unknown })?.microcredits;
    const val = (raw as { value?: unknown })?.value ?? raw;
    if (val != null) return typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10) || null;
    return null;
  } catch {
    return null;
  }
}

export function getTokenAmountFromTokenRecord(recordItem: unknown): number | null {
  try {
    const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
    const match = str.match(/amount["\s:]+(\d+)u128/);
    if (match) return parseInt(match[1], 10);

    const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
    const data = (record as { data?: unknown; plaintext?: unknown })?.data ?? (record as { plaintext?: unknown })?.plaintext ?? record;
    const raw = (data as { amount?: unknown })?.amount;
    const val = (raw as { value?: unknown })?.value ?? raw;
    if (val != null) return typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10) || null;
    return null;
  } catch {
    return null;
  }
}

export function getTokenIdFromTokenRecord(recordItem: unknown): string | null {
  try {
    const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
    const match = str.match(/token_id["\s:]+(\d+)field/);
    if (match) return `${match[1]}field`;

    const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
    const data = (record as { data?: unknown; plaintext?: unknown })?.data ?? (record as { plaintext?: unknown })?.plaintext ?? record;
    const raw = (data as { token_id?: unknown })?.token_id;
    const val = (raw as { value?: unknown })?.value ?? raw;
    if (val == null) return null;
    const s = String(val).replace(/\.private|\.public/g, "");
    const m = s.match(/(\d+)field/);
    return m ? `${m[1]}field` : null;
  } catch {
    return null;
  }
}

export function toWalletRecordInput(recordItem: unknown): string {
  if (typeof recordItem === "string") return recordItem;
  const r = recordItem as Record<string, unknown>;
  const str =
    (typeof r?.plaintext === "string" ? (r.plaintext as string) : null) ??
    (typeof r?.ciphertext === "string" ? (r.ciphertext as string) : null) ??
    (typeof r?.record === "string" ? (r.record as string) : null);
  if (typeof str === "string" && str.length > 10) return str;
  return JSON.stringify(recordItem);
}

