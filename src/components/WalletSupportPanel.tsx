"use client";

import { CheckCircle2, ShieldAlert, Wallet } from "lucide-react";

const WALLETS = [
  {
    name: "Shield",
    note: "Best default for gate flows. Record access is stable; on-chain history permission is optional.",
    status: "recommended",
  },
  {
    name: "Leo",
    note: "Works for purchases and verification, but confirmations can take longer to surface in wallet history.",
    status: "supported",
  },
  {
    name: "Puzzle",
    note: "Good for record-heavy flows. Reconnect if record permissions were denied previously.",
    status: "supported",
  },
  {
    name: "Fox",
    note: "Supported for auth and transaction submission; verify token and record permissions after connect.",
    status: "supported",
  },
] as const;

export function WalletSupportPanel() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-primary/80">Wallet Readiness</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-5xl">Supported Testnet Wallet Paths</h2>
          </div>
          <p className="max-w-xl text-sm text-zinc-400">
            PassMeet is tuned for Shield, Leo, Puzzle, and Fox. The app avoids brittle history dependencies whenever the wallet can complete the flow directly.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {WALLETS.map((wallet) => (
            <div key={wallet.name} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{wallet.name}</h3>
                </div>
                {wallet.status === "recommended" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-zinc-500" />
                )}
              </div>
              <p className="mt-4 text-sm text-zinc-400">{wallet.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
