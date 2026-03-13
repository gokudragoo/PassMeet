"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { Button } from "@/components/ui/button";
import { 
  Check, 
  Zap, 
  Shield, 
  Star, 
  Crown, 
  Loader2, 
  Globe,
  Lock,
  Users,
  Wallet,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { usePassMeet, type PaymentRail } from "@/context/PassMeetContext";
import {
  PASSMEET_SUBS_PROGRAM_ID,
  getTransactionUrl,
  getProgramUrl,
  CREDITS_PROGRAM_ID,
  TOKEN_REGISTRY_PROGRAM_ID,
  USDCX_TOKEN_ID,
  USAD_TOKEN_ID,
  normalizeFieldLiteral,
} from "@/lib/aleo";
import { getLatestBlockHeight } from "@/lib/aleo-rpc";
import { getSubscription, getSubscriptionTreasury, getSubscriptionTokenId } from "@/lib/aleo-subs-rpc";
import { pollForTxHash, snapshotTxHistory } from "@/lib/walletTx";
import {
  getMicrocreditsFromCreditsRecord,
  getTokenAmountFromTokenRecord,
  getTokenIdFromTokenRecord,
  toWalletRecordInput,
} from "@/lib/aleoRecords";

const TIER_NAMES: Record<number, string> = {
  0: "Free",
  1: "Organizer Pro",
  2: "Enterprise",
};

export default function SubscriptionPage() {
  const { address, executeTransaction, transactionStatus, requestTransactionHistory, requestRecords } = useWallet();
  const { isAuthenticated } = usePassMeet();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState("Free");
  const [tierLoading, setTierLoading] = useState(true);
  const [selectedRailByTier, setSelectedRailByTier] = useState<Record<number, PaymentRail>>({
    1: "credits",
    2: "credits",
  });
  const [subsConfig, setSubsConfig] = useState<{
    treasury: string | null;
    usdcxId: string | null;
    usadId: string | null;
    loading: boolean;
  }>({
    treasury: null,
    usdcxId: null,
    usadId: null,
    loading: true,
  });
  const [configuring, setConfiguring] = useState(false);
  const [latestHeight, setLatestHeight] = useState<number | null>(null);

  const envUsdcx = normalizeFieldLiteral(USDCX_TOKEN_ID);
  const envUsad = normalizeFieldLiteral(USAD_TOKEN_ID);

  const SUB_PRICES_MICRO: Record<number, Record<PaymentRail, number>> = {
    1: { credits: 500_000, usdcx: 5_000_000, usad: 5_000_000 },
    2: { credits: 1_000_000, usdcx: 10_000_000, usad: 10_000_000 },
  };

  function formatMicro(micro: number): string {
    return (micro / 1_000_000).toFixed(2).replace(/\.00$/, "");
  }

  function railLabel(rail: PaymentRail): string {
    if (rail === "credits") return "Aleo Credits";
    if (rail === "usdcx") return "USDCx";
    return "USAD";
  }

  function railConfigured(rail: PaymentRail): boolean {
    if (rail === "credits") return true;
    if (rail === "usdcx") return !!envUsdcx;
    return !!envUsad;
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [treasury, usdcxId, usadId] = await Promise.all([
          getSubscriptionTreasury(),
          getSubscriptionTokenId(0),
          getSubscriptionTokenId(1),
        ]);
        if (!cancelled) setSubsConfig({ treasury: treasury ?? null, usdcxId: usdcxId ?? null, usadId: usadId ?? null, loading: false });
      } catch {
        if (!cancelled) setSubsConfig({ treasury: null, usdcxId: null, usadId: null, loading: false });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfigureSubscriptions = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }
    if (!executeTransaction) {
      toast.error("Wallet does not support transactions");
      return;
    }
    if (!envUsdcx || !envUsad) {
      toast.error("Token IDs not configured", {
        description: "Set NEXT_PUBLIC_USDCX_TOKEN_ID and NEXT_PUBLIC_USAD_TOKEN_ID for this deployment.",
      });
      return;
    }

    setConfiguring(true);
    try {
      toast.info("Configuring subscription payments on-chain...");
      const historyBefore = await snapshotTxHistory(requestTransactionHistory, PASSMEET_SUBS_PROGRAM_ID);
      const result = await executeTransaction({
        program: PASSMEET_SUBS_PROGRAM_ID,
        function: "configure",
        inputs: [address, envUsdcx, envUsad],
        fee: 100_000,
      });
      const tempId = result?.transactionId;
      if (!tempId) throw new Error("Transaction was not submitted.");

      const confirm = await pollForTxHash(tempId, transactionStatus, {
        program: PASSMEET_SUBS_PROGRAM_ID,
        requestTransactionHistory,
        historyBefore,
      });
      if (confirm.state !== "confirmed" || !confirm.txHash) {
        throw new Error(
          confirm.state === "rejected" ? "Configuration was rejected." :
          confirm.state === "failed" ? "Configuration failed on-chain." :
          "Configuration confirmation timed out."
        );
      }

      toast.success("Subscriptions configured!", { description: `Tx: ${confirm.txHash.slice(0, 16)}...` });
      const [treasury, usdcxId, usadId] = await Promise.all([
        getSubscriptionTreasury(),
        getSubscriptionTokenId(0),
        getSubscriptionTokenId(1),
      ]);
      setSubsConfig({ treasury: treasury ?? null, usdcxId: usdcxId ?? null, usadId: usadId ?? null, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to configure subscriptions";
      toast.error(msg);
    } finally {
      setConfiguring(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchTier = async () => {
      if (!address) {
        setTierLoading(false);
        setCurrentTier("Free");
        setLatestHeight(null);
        return;
      }
      setTierLoading(true);
      try {
        const [sub, height] = await Promise.all([getSubscription(address), getLatestBlockHeight()]);
        if (cancelled) return;
        setLatestHeight(height);
        if (sub && sub.tier > 0 && height != null && sub.end_height > height) {
          setCurrentTier(TIER_NAMES[sub.tier] ?? "Free");
        } else {
          setCurrentTier("Free");
        }
      } catch {
        if (!cancelled) {
          setCurrentTier("Free");
          setLatestHeight(null);
        }
      } finally {
        if (!cancelled) setTierLoading(false);
      }
    };
    fetchTier();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const tiers = [
    {
      name: "Free",
      id: 0,
      description: "For casual attendees",
      icon: Star,
      features: [
        "Store up to 5 tickets",
        "Basic ZK-Verification",
        "Community Support",
        "Standard Speed"
      ],
      cta: "Current Plan",
      highlight: false
    },
    {
      name: "Organizer Pro",
      id: 1,
      description: "Perfect for event creators",
      icon: Zap,
      features: [
        "Unlimited Event Creation",
        "Advanced Privacy Analytics",
        "Custom Entry Rules",
        "Priority Support",
        "Bulk Ticket Minting"
      ],
      cta: "Upgrade to Pro",
      highlight: true
    },
    {
      name: "Enterprise",
      id: 2,
      description: "For large-scale conferences",
      icon: Crown,
      features: [
        "Unlimited Everything",
        "White-label Gates",
        "Direct Aleo Node Access",
        "On-site Verification Hardware",
        "24/7 Dedicated Support"
      ],
      cta: "Contact Sales",
      highlight: false
    }
  ];

  const handleSubscribe = async (tier: typeof tiers[0]) => {
    console.log("[PassMeet Subscription] handleSubscribe: start", { tier: tier.name });
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }
    if (!executeTransaction) {
      toast.error("Wallet does not support transactions");
      return;
    }
    if (!requestRecords) {
      toast.error("Wallet does not support record requests");
      return;
    }
    if (tier.id === 0) return;

    if (!subsConfig.treasury) {
      toast.error("Subscription contract is not configured", {
        description: "An admin must configure the treasury + token IDs on-chain before subscriptions can be purchased.",
      });
      return;
    }

    const rail: PaymentRail = selectedRailByTier[tier.id] ?? "credits";
    const microPrice = SUB_PRICES_MICRO[tier.id]?.[rail] ?? 0;
    if (microPrice <= 0) {
      toast.error("This payment rail is not available for this tier.");
      return;
    }
    if (!railConfigured(rail)) {
      toast.error("Token rail not configured", {
        description: `Set NEXT_PUBLIC_${rail.toUpperCase()}_TOKEN_ID for this deployment.`,
      });
      return;
    }

    setLoading(tier.name);
    try {
      toast.info(`Subscribing to ${tier.name} with ${railLabel(rail)}...`);

      const FEE_TX = 100_000;
      const historyBefore = await snapshotTxHistory(requestTransactionHistory, PASSMEET_SUBS_PROGRAM_ID);

      let functionName: string;
      let inputs: string[];

      if (rail === "credits") {
        const required = microPrice + FEE_TX;
        const records = (await requestRecords(CREDITS_PROGRAM_ID, true)) ?? [];
        const recordItem =
          records.find((r) => (getMicrocreditsFromCreditsRecord(r) ?? 0) >= required) ??
          records.find((r) => (getMicrocreditsFromCreditsRecord(r) ?? 0) >= microPrice) ??
          null;
        if (!recordItem) {
          throw new Error(`Insufficient private balance. Need at least ${(required / 1_000_000).toFixed(2).replace(/\\.00$/, "")} Aleo in one credits record.`);
        }
        functionName = "subscribe_with_credits";
        inputs = [`${tier.id}u8`, toWalletRecordInput(recordItem)];
      } else {
        // token_registry rail
        if (!subsConfig.usdcxId || subsConfig.usdcxId === "0field" || !subsConfig.usadId || subsConfig.usadId === "0field") {
          throw new Error("Token rails are not configured on-chain for the subscription contract.");
        }

        const tokenProgram = TOKEN_REGISTRY_PROGRAM_ID;
        const tokenId = rail === "usdcx" ? envUsdcx : envUsad;
        if (!tokenId) throw new Error("Missing token ID in env.");

        const records = (await requestRecords(tokenProgram, true)) ?? [];
        const recordItem = records.find((r) => {
          const rid = getTokenIdFromTokenRecord(r);
          const amt = getTokenAmountFromTokenRecord(r) ?? 0;
          return rid === tokenId && amt >= microPrice;
        });
        if (!recordItem) {
          throw new Error(`No ${railLabel(rail)} token record found with sufficient private balance.`);
        }

        functionName = "subscribe";
        inputs = [`${tier.id}u8`, toWalletRecordInput(recordItem)];
      }

      const result = await executeTransaction({
        program: PASSMEET_SUBS_PROGRAM_ID,
        function: functionName,
        inputs,
        fee: FEE_TX,
      });

      const tempId = result?.transactionId;
      console.log("[PassMeet Subscription] subscribe: tx submitted", { tempId });
      if (!tempId) throw new Error("Transaction was not submitted.");

      const confirm = await pollForTxHash(tempId, transactionStatus, {
        program: PASSMEET_SUBS_PROGRAM_ID,
        requestTransactionHistory,
        historyBefore,
      });
      if (confirm.state !== "confirmed" || !confirm.txHash) {
        throw new Error(
          confirm.state === "rejected" ? "Subscription was rejected." :
          confirm.state === "failed" ? "Subscription failed on-chain." :
          "Subscription confirmation timed out. Check your wallet for status."
        );
      }

      const txHash = confirm.txHash;
      setCurrentTier(tier.name);

      const explorerUrl = getTransactionUrl(txHash);
      toast.success(`Subscribed to ${tier.name}!`, {
        description: explorerUrl ? `Transaction: ${txHash.slice(0, 16)}...` : "Transaction confirmed on-chain.",
        ...(explorerUrl && {
          action: { label: "View on Explorer", onClick: () => window.open(explorerUrl, "_blank") }
        })
      });

      const height = await getLatestBlockHeight();
      setLatestHeight(height);
    } catch (error) {
      console.log("[PassMeet Subscription] subscribe: error", error);
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Subscription failed";
      toast.error(errorMessage);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-20">
      <div className="mb-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary border border-primary/20"
        >
          <Crown className="h-4 w-4" />
          On-Chain Subscriptions
        </motion.div>
        <h1 className="text-4xl font-bold text-white md:text-6xl">Choose Your Plan</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {tierLoading ? "Loading your plan..." : "Unlock the full power of privacy-preserving events on Aleo."}
        </p>
      </div>

      <div className="mb-10 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-white">Contract Status</p>
            <p className="text-xs text-zinc-400">
              {subsConfig.loading
                ? "Checking subscription contract config..."
                : subsConfig.treasury
                  ? `Treasury: ${subsConfig.treasury.slice(0, 10)}...${subsConfig.treasury.slice(-4)}`
                  : "Not configured yet (admin must configure treasury + token IDs)."}
              {latestHeight != null ? ` · Latest height: ${latestHeight}` : ""}
            </p>
          </div>
          {!subsConfig.treasury && (
            <Button
              type="button"
              variant="outline"
              onClick={handleConfigureSubscriptions}
              disabled={!address || !isAuthenticated || configuring || subsConfig.loading}
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              {configuring ? <Loader2 className="h-4 w-4 animate-spin" /> : "Configure Subscriptions"}
            </Button>
          )}
        </div>
        {(!envUsdcx || !envUsad) && (
          <p className="mt-3 text-xs text-yellow-400/90">
            Missing env token IDs. Set `NEXT_PUBLIC_USDCX_TOKEN_ID` and `NEXT_PUBLIC_USAD_TOKEN_ID` to enable token payments.
          </p>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {tiers.map((tier) => {
          const isFreeTier = tier.id === 0;
          const rail: PaymentRail = selectedRailByTier[tier.id] ?? "credits";
          const microPrice = isFreeTier ? 0 : (SUB_PRICES_MICRO[tier.id]?.[rail] ?? 0);
          const railOk = isFreeTier ? true : railConfigured(rail);
          const subsOk = isFreeTier ? true : !!subsConfig.treasury;

          const buttonDisabled =
            loading !== null ||
            currentTier === tier.name ||
            !address ||
            !isAuthenticated ||
            (!isFreeTier && (!subsOk || !railOk));

          return (
            <motion.div
              key={tier.name}
              whileHover={{ y: -10 }}
              className={`relative flex flex-col rounded-3xl border ${
                tier.highlight
                  ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(29,185,84,0.1)]"
                  : "border-white/10 bg-white/5"
              } p-8`}
            >
              {tier.highlight && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary px-4 py-1 rounded-full text-black text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div className="mb-8 flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tier.highlight ? "bg-primary text-black" : "bg-white/10 text-white"}`}>
                  <tier.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold text-white">{formatMicro(microPrice)}</span>
                <span className="ml-2 text-muted-foreground">{isFreeTier ? "Aleo / mo" : `${railLabel(rail)} / period`}</span>
              </div>

              {!isFreeTier && (
                <div className="mb-6">
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
                    Payment Rail
                  </label>
                  <select
                    value={rail}
                    onChange={(e) => setSelectedRailByTier((prev) => ({ ...prev, [tier.id]: e.target.value as PaymentRail }))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                  >
                    {(["credits", "usdcx", "usad"] as const).map((r) => (
                      <option key={r} value={r} disabled={!railConfigured(r)}>
                        {railLabel(r)} · {formatMicro(SUB_PRICES_MICRO[tier.id]?.[r] ?? 0)}
                        {!railConfigured(r) ? " (needs config)" : ""}
                      </option>
                    ))}
                  </select>
                  {!subsOk ? (
                    <p className="mt-1 text-xs text-yellow-400/90">
                      Contract not configured yet. An admin must configure treasury + token IDs before paid subscriptions work.
                    </p>
                  ) : !railOk ? (
                    <p className="mt-1 text-xs text-yellow-400/90">
                      {railLabel(rail)} is not configured on this deployment.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="mb-8 space-y-4 flex-1">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full ${tier.highlight ? "bg-primary/20 text-primary" : "bg-white/10 text-white"}`}>
                      <Check className="h-3 w-3" />
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleSubscribe(tier)}
                disabled={buttonDisabled}
                className={`w-full rounded-full h-12 font-bold transition-all ${
                  tier.highlight
                    ? "bg-primary text-black hover:bg-primary/90"
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {loading === tier.name ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : !address ? (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    Connect Wallet
                  </>
                ) : !isAuthenticated ? (
                  "Sign to Verify"
                ) : currentTier === tier.name ? (
                  "Active Plan"
                ) : (
                  tier.cta
                )}
              </Button>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-16 text-center">
        <a
          href={getProgramUrl(PASSMEET_SUBS_PROGRAM_ID)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-primary transition-colors"
        >
          View Subscription Contract on Explorer
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-900 to-black p-12">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-6">Why Subscribe?</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Lock className="h-5 w-5" />
                  <span className="font-bold">Enhanced Encryption</span>
                </div>
                <p className="text-sm text-muted-foreground">Double-layered encryption for sensitive event data.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Users className="h-5 w-5" />
                  <span className="font-bold">Bulk Actions</span>
                </div>
                <p className="text-sm text-muted-foreground">Mint thousands of tickets in a single ZK-transaction.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Globe className="h-5 w-5" />
                  <span className="font-bold">Global Presence</span>
                </div>
                <p className="text-sm text-muted-foreground">Access nodes across all Aleo regions for low latency.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Shield className="h-5 w-5" />
                  <span className="font-bold">Audit Trails</span>
                </div>
                <p className="text-sm text-muted-foreground">Selective disclosure for private regulatory compliance.</p>
              </div>
            </div>
          </div>
          <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=1200&auto=format&fit=crop" 
              className="h-full w-full object-cover opacity-60" 
              alt="Developer working"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
            <div className="absolute bottom-8 left-8 right-8">
              <p className="text-white font-mono text-xs mb-2">aleo run check_subscription --user</p>
              <div className="flex items-center gap-2 text-primary font-bold">
                <Check className="h-4 w-4" />
                <span>Subscription Verified On-Chain</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
