import { NextResponse } from "next/server";
import { getLatestBlockHeight, getEventCounter, getConfiguredTokenId } from "@/lib/aleo-rpc";
import { getSubscriptionTokenId, getSubscriptionTreasury } from "@/lib/aleo-subs-rpc";
import {
  ALEO_NETWORK,
  ALEO_RPC_URL,
  PASSMEET_SUBS_PROGRAM_ID,
  PASSMEET_V1_PROGRAM_ID,
  TOKEN_REGISTRY_PROGRAM_ID,
  USAD_TOKEN_ID,
  USDCX_TOKEN_ID,
} from "@/lib/aleo";
import { getPassMeetAuthSecret } from "@/lib/auth";

export async function GET() {
  const authConfigured = (() => {
    try {
      return !!getPassMeetAuthSecret();
    } catch {
      return false;
    }
  })();

  const ipfsConfigured = !!process.env.PINATA_JWT;
  const tokenEnvConfigured = !!USDCX_TOKEN_ID && !!USAD_TOKEN_ID;

  const [latestBlockHeight, eventCounter, eventUsdcx, eventUsad, subsTreasury, subsUsdcx, subsUsad] = await Promise.all([
    getLatestBlockHeight().catch(() => null),
    getEventCounter().catch(() => null),
    getConfiguredTokenId(0).catch(() => null),
    getConfiguredTokenId(1).catch(() => null),
    getSubscriptionTreasury().catch(() => null),
    getSubscriptionTokenId(0).catch(() => null),
    getSubscriptionTokenId(1).catch(() => null),
  ]);

  const rpcReachable = latestBlockHeight != null || eventCounter != null;
  const status = authConfigured && rpcReachable ? "ok" : "degraded";

  return NextResponse.json({
    status,
    checkedAt: new Date().toISOString(),
    network: ALEO_NETWORK,
    rpcUrl: ALEO_RPC_URL,
    rpcReachable,
    latestBlockHeight,
    eventCounter,
    features: {
      authConfigured,
      ipfsConfigured,
      tokenEnvConfigured,
      qrEntry: true,
      resaleDesk: true,
      multiCurrency: true,
    },
    programs: {
      events: PASSMEET_V1_PROGRAM_ID,
      subscriptions: PASSMEET_SUBS_PROGRAM_ID,
      tokenRegistry: TOKEN_REGISTRY_PROGRAM_ID,
    },
    contracts: {
      eventTokensConfigured: {
        usdcx: eventUsdcx,
        usad: eventUsad,
      },
      subscriptionConfig: {
        treasury: subsTreasury,
        usdcx: subsUsdcx,
        usad: subsUsad,
      },
    },
  });
}
