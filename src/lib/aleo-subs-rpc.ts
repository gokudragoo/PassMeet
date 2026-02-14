import { ALEO_NETWORK, ALEO_RPC_URL, PASSMEET_SUBS_PROGRAM_ID } from "./aleo";

const ALEO_JSON_RPC = "https://testnet3.aleorpc.com";

export interface OnChainSubscription {
  tier: number;
  expiry: number;
}

async function fetchSubsMappingValue(key: string): Promise<string | null> {
  try {
    const url = `${ALEO_RPC_URL}/${ALEO_NETWORK}/program/${PASSMEET_SUBS_PROGRAM_ID}/mapping/user_subs/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      const text = await response.text();
      if (text && text.trim() !== "null") {
        let cleaned = text.trim();
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
          cleaned = cleaned.slice(1, -1);
        }
        cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        if (cleaned) return cleaned;
      }
    }
  } catch (error) {
    console.error("Provable fetch failed for user_subs:", error);
  }

  try {
    const response = await fetch(ALEO_JSON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMappingValue",
        params: {
          program_id: PASSMEET_SUBS_PROGRAM_ID,
          mapping_name: "user_subs",
          key,
        },
      }),
    });
    const json = await response.json();
    const result = json?.result;
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.error("JSON-RPC fallback failed for user_subs:", error);
    return null;
  }
}

/**
 * Fetches subscription for an address from passmeet_subs_7788.aleo.
 * Returns null if no subscription or RPC fails.
 * tier: 0=Free, 1=Organizer Pro, 2=Enterprise
 */
export async function getSubscription(
  address: string
): Promise<OnChainSubscription | null> {
  const text = await fetchSubsMappingValue(address);
  if (!text) return null;

  const tierMatch = text.match(/tier:\s*(\d+)u8/);
  const expiryMatch = text.match(/expiry:\s*(\d+)u32/);

  if (!tierMatch) return null;

  return {
    tier: parseInt(tierMatch[1], 10),
    expiry: expiryMatch ? parseInt(expiryMatch[1], 10) : 0,
  };
}
