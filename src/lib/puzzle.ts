import { 
  requestSignature, 
  disconnect, 
} from "@puzzlehq/sdk-core";
import { Network } from "@puzzlehq/sdk";

export const PASSMEET_PROGRAM_IDS = [
  "passmeet_v1_7788.aleo",
  "passmeet_subs_7788.aleo",
  "credits.aleo"
];

export const CONNECT_CONFIG = {
  dAppInfo: {
    name: "PassMeet",
    description: "Private Event Access & Ticket Verification on Aleo",
    iconUrl: "https://passmeet-chi.vercel.app/logo.png",
  },
  permissions: {
    programIds: {
      [Network.AleoTestnet]: PASSMEET_PROGRAM_IDS,
      [Network.AleoMainnet]: PASSMEET_PROGRAM_IDS,
    },
  },
};

export async function signMessage(message: string) {
  try {
    const response = await requestSignature({ message });
    return response;
  } catch (error) {
    console.error("Signature failed:", error);
    throw error;
  }
}

export async function logout() {
  try {
    await disconnect();
  } catch (error) {
    console.error("Logout failed:", error);
  }
}
