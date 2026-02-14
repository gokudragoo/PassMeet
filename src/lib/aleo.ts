export const ALEO_NETWORK = process.env.NEXT_PUBLIC_ALEO_NETWORK || "testnet";
export const ALEO_RPC_URL = process.env.NEXT_PUBLIC_ALEO_RPC_URL || "https://api.explorer.provable.com/v2";

export const PASSMEET_V1_PROGRAM_ID = process.env.NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID || "passmeet_v1_7788.aleo";
export const PASSMEET_SUBS_PROGRAM_ID = process.env.NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID || "passmeet_subs_7788.aleo";

export const PROGRAM_IDS = [
  PASSMEET_V1_PROGRAM_ID,
  PASSMEET_SUBS_PROGRAM_ID,
];

/** Provable Explorer - use to verify transactions and programs on-chain */
export const EXPLORER_BASE = "https://testnet.explorer.provable.com";

/** Aleo on-chain tx IDs start with "at1" and are 61+ chars. Temp UUIDs (d8f2dae9-...) are invalid for explorer. */
export function isOnChainTxHash(id: string): boolean {
  return typeof id === "string" && id.startsWith("at1") && id.length >= 61;
}

export function getTransactionUrl(txHash: string): string | null {
  if (!isOnChainTxHash(txHash)) return null;
  return `${EXPLORER_BASE}/transaction/${txHash}`;
}

export function getProgramUrl(programId: string): string {
  return `${EXPLORER_BASE}/program/${programId}`;
}
