"use client";

import { ALEO_NETWORK } from "@/lib/aleo";
import { AlertTriangle } from "lucide-react";

export function NetworkBanner() {
  if (ALEO_NETWORK !== "testnet") return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 py-2">
      <div className="container mx-auto px-4 flex items-center justify-center gap-2 text-amber-200 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          You are on <strong>Aleo Testnet</strong>. Use testnet ALEO only. Switch network in your wallet for mainnet.
        </span>
      </div>
    </div>
  );
}
