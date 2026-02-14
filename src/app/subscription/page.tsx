"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { Transaction, WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
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
import { usePassMeet } from "@/context/PassMeetContext";
import { PASSMEET_SUBS_PROGRAM_ID, getTransactionUrl, getProgramUrl } from "@/lib/aleo";
import { getSubscription } from "@/lib/aleo-subs-rpc";

const TIER_NAMES: Record<number, string> = {
  0: "Free",
  1: "Organizer Pro",
  2: "Enterprise",
};

export default function SubscriptionPage() {
  const { publicKey, requestTransaction } = useWallet();
  const { isAuthenticated } = usePassMeet();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState("Free");
  const [tierLoading, setTierLoading] = useState(true);

  useEffect(() => {
    async function fetchTier() {
      if (!publicKey) {
        setTierLoading(false);
        setCurrentTier("Free");
        return;
      }
      setTierLoading(true);
      try {
        const sub = await getSubscription(publicKey);
        if (sub && sub.tier > 0 && sub.expiry > Math.floor(Date.now() / 1000)) {
          setCurrentTier(TIER_NAMES[sub.tier] ?? "Free");
        } else {
          const stored = localStorage.getItem("passmeet_subscription");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (parsed.address === publicKey) {
                setCurrentTier(parsed.tier ?? "Free");
              }
            } catch {
              setCurrentTier("Free");
            }
          } else {
            setCurrentTier("Free");
          }
        }
      } catch {
        const stored = localStorage.getItem("passmeet_subscription");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.address === publicKey) setCurrentTier(parsed.tier ?? "Free");
          } catch {
            setCurrentTier("Free");
          }
        } else {
          setCurrentTier("Free");
        }
      } finally {
        setTierLoading(false);
      }
    }
    fetchTier();
  }, [publicKey]);

  const tiers = [
    {
      name: "Free",
      id: 0,
      price: "0",
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
      price: "15",
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
      price: "50",
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
    if (!publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }
    if (!requestTransaction) {
      toast.error("Wallet does not support transactions");
      return;
    }
    if (tier.id === 0) return;

    setLoading(tier.name);
    try {
      toast.info(`Initiating Subscription to ${tier.name} on Aleo...`);

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_SUBS_PROGRAM_ID,
        "subscribe",
        [`${tier.id}u8`, "2592000u32"],
        100000
      );

      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        setCurrentTier(tier.name);
        localStorage.setItem("passmeet_subscription", JSON.stringify({
          tier: tier.name,
          address: publicKey,
          timestamp: Date.now(),
          txHash
        }));
        toast.success(`Subscribed to ${tier.name}!`, {
          description: `Transaction: ${txHash.slice(0, 16)}...`,
          action: {
            label: "View",
            onClick: () => window.open(getTransactionUrl(txHash), "_blank")
          }
        });
      } else {
        toast.error("Transaction was not confirmed");
      }
    } catch (error) {
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
          Unlock the full power of privacy-preserving events on Aleo.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {tiers.map((tier) => (
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

            <div className="mb-8">
              <span className="text-5xl font-bold text-white">{tier.price}</span>
              <span className="ml-2 text-muted-foreground">Aleo / mo</span>
            </div>

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
              disabled={loading !== null || currentTier === tier.name || !publicKey}
              className={`w-full rounded-full h-12 font-bold transition-all ${
                tier.highlight 
                  ? "bg-primary text-black hover:bg-primary/90" 
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {loading === tier.name ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : !publicKey ? (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </>
              ) : currentTier === tier.name ? (
                "Active Plan"
              ) : (
                tier.cta
              )}
            </Button>
          </motion.div>
        ))}
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
