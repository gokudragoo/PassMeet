export const ALEO_NETWORK = process.env.NEXT_PUBLIC_ALEO_NETWORK || "testnet";
export const ALEO_RPC_URL = process.env.NEXT_PUBLIC_ALEO_RPC_URL || "https://api.explorer.provable.com/v2";

export const PASSMEET_V1_PROGRAM_ID = process.env.NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID || "passmeet_v1_7788.aleo";
export const PASSMEET_SUBS_PROGRAM_ID = process.env.NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID || "passmeet_subs_7788.aleo";

export const PROGRAM_IDS = [
  PASSMEET_V1_PROGRAM_ID,
  PASSMEET_SUBS_PROGRAM_ID,
];
