"use client";

import { useState } from "react";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  PASSMEET_V1_PROGRAM_ID,
  PASSMEET_SUBS_PROGRAM_ID,
  TOKEN_REGISTRY_PROGRAM_ID,
  USDCX_TOKEN_ID as ENV_USDCX_TOKEN_ID,
  USAD_TOKEN_ID as ENV_USAD_TOKEN_ID,
  normalizeFieldLiteral,
} from "@/lib/aleo";

// ----- Token Config -----
const USDCX_TOKEN_ID = normalizeFieldLiteral(ENV_USDCX_TOKEN_ID) || "7788001field";
const USAD_TOKEN_ID = normalizeFieldLiteral(ENV_USAD_TOKEN_ID) || "7788002field";

const USDCX_NAME = "366469202808u128";   // "USDCx" as u128
const USDCX_SYMBOL = "366469202808u128";
const USAD_NAME = "1431519556u128";       // "USAD" as u128
const USAD_SYMBOL = "1431519556u128";

const DECIMALS = "6u8";
const MAX_SUPPLY = "10000000000000000u128";
const MINT_AMOUNT = "1000000000u128"; // 1000 tokens (6 decimals)

const TOKEN_REGISTRY = TOKEN_REGISTRY_PROGRAM_ID || "token_registry.aleo";
const EVENT_PROGRAM = PASSMEET_V1_PROGRAM_ID;
const SUBS_PROGRAM = PASSMEET_SUBS_PROGRAM_ID;

const FEE = 2_000_000; // 2.0 Aleo in microcredits (higher to prevent network drops)

type StepStatus = "idle" | "loading" | "success" | "error";

interface StepState {
  status: StepStatus;
  message: string;
}

export default function AdminTokensPage() {
  const { address, executeTransaction } = useWallet();

  const [steps, setSteps] = useState<Record<string, StepState>>({
    regUsdcx: { status: "idle", message: "" },
    regUsad: { status: "idle", message: "" },
    mintUsdcx: { status: "idle", message: "" },
    mintUsad: { status: "idle", message: "" },
    configEvent: { status: "idle", message: "" },
    configSubs: { status: "idle", message: "" },
  });

  function updateStep(key: string, status: StepStatus, message: string) {
    setSteps(prev => ({ ...prev, [key]: { status, message } }));
  }

  async function checkTokenRegistered(tokenId: string): Promise<boolean> {
    try {
      const url = `https://api.explorer.provable.com/v1/testnet/program/token_registry.aleo/mapping/registered_tokens/${tokenId}`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        return !!(text && text.trim() !== "null");
      }
    } catch { /* ignore */ }
    return false;
  }

  async function executeTx(
    program: string,
    functionName: string,
    inputs: string[],
    stepKey: string,
    label: string
  ) {
    if (!executeTransaction) {
      updateStep(stepKey, "error", "Wallet does not support transactions. Connect Shield wallet.");
      return false;
    }

    updateStep(stepKey, "loading", `Submitting ${label}... Approve in your wallet.`);
    console.log(`[TokenAdmin] Executing ${program}/${functionName}`, inputs);

    try {
      const txPayload = {
        program,
        function: functionName,
        inputs,
        fee: FEE,
      };

      // Retry up to 3 times (same pattern as buyTicket in PassMeetContext)
      let result: { transactionId?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = (await executeTransaction(txPayload)) ?? null;
          console.log(`[TokenAdmin] Attempt ${attempt + 1} result:`, result);
          if (result?.transactionId) break;
        } catch (retryErr) {
          console.warn(`[TokenAdmin] Attempt ${attempt + 1} threw:`, retryErr);
          // On last attempt, re-throw
          if (attempt === 2) throw retryErr;
        }
        if (attempt < 2) {
          updateStep(stepKey, "loading", `Retrying ${label} (attempt ${attempt + 2}/3)...`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      const txId = result?.transactionId;
      console.log(`[TokenAdmin] Final txId:`, txId);

      if (txId) {
        updateStep(stepKey, "success",
          `✅ Transaction submitted!\nID: ${txId.slice(0, 40)}...\n\nWait 1-3 min, then click "Check Status" to verify on-chain.`
        );
        toast.success(`${label} submitted! Wait for on-chain confirmation.`);
        return true;
      } else {
        updateStep(stepKey, "error",
          "No transaction ID returned after 3 attempts. The wallet may have rejected it silently. Check the browser console (F12) for details."
        );
        return false;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[TokenAdmin] Error:`, e);
      // If "not found" — Shield sent it but polling failed, treat as success
      if (msg.includes("not found") || msg.includes("Transaction not found")) {
        updateStep(stepKey, "success",
          `⏳ Transaction sent! The "not found" message is normal for Shield.\n\nWait 1-3 min, then click "Check Status" to verify.`
        );
        toast.info(`${label} sent! Wait for confirmation.`);
        return true;
      }
      updateStep(stepKey, "error", `❌ ${msg}`);
      toast.error(msg);
      return false;
    }
  }

  // ----- Actions -----

  async function registerUsdcx() {
    await executeTx(
      TOKEN_REGISTRY, "register_token",
      [USDCX_TOKEN_ID, USDCX_NAME, USDCX_SYMBOL, DECIMALS, MAX_SUPPLY, "false", address!],
      "regUsdcx", "Register USDCx"
    );
  }

  async function registerUsad() {
    await executeTx(
      TOKEN_REGISTRY, "register_token",
      [USAD_TOKEN_ID, USAD_NAME, USAD_SYMBOL, DECIMALS, MAX_SUPPLY, "false", address!],
      "regUsad", "Register USAD"
    );
  }

  async function mintUsdcx() {
    // mint_private takes 5 inputs: token_id, receiver, amount, external_authorization_required, authorized_until
    await executeTx(
      TOKEN_REGISTRY, "mint_private",
      [USDCX_TOKEN_ID, address!, MINT_AMOUNT, "false", "0u32"],
      "mintUsdcx", "Mint USDCx"
    );
  }

  async function mintUsad() {
    // mint_private takes 5 inputs: token_id, receiver, amount, external_authorization_required, authorized_until
    await executeTx(
      TOKEN_REGISTRY, "mint_private",
      [USAD_TOKEN_ID, address!, MINT_AMOUNT, "false", "0u32"],
      "mintUsad", "Mint USAD"
    );
  }

  async function configureEventContract() {
    await executeTx(
      EVENT_PROGRAM, "configure_tokens",
      [USDCX_TOKEN_ID, USAD_TOKEN_ID],
      "configEvent", "Configure Event Contract"
    );
  }

  async function configureSubsContract() {
    await executeTx(
      SUBS_PROGRAM, "configure",
      [address!, USDCX_TOKEN_ID, USAD_TOKEN_ID],
      "configSubs", "Configure Subscription Contract"
    );
  }

  async function handleCheckToken(which: "usdcx" | "usad") {
    const tokenId = which === "usdcx" ? USDCX_TOKEN_ID : USAD_TOKEN_ID;
    const stepKey = which === "usdcx" ? "regUsdcx" : "regUsad";
    const label = which === "usdcx" ? "USDCx" : "USAD";

    updateStep(stepKey, "loading", `Checking ${label} on-chain...`);
    const exists = await checkTokenRegistered(tokenId);
    if (exists) {
      updateStep(stepKey, "success", `✅ ${label} (${tokenId}) is registered on-chain!`);
    } else {
      updateStep(stepKey, "error", `❌ ${label} (${tokenId}) is NOT registered yet.`);
    }
  }

  // ----- Render -----

  function StepIcon({ status }: { status: StepStatus }) {
    if (status === "loading") return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    if (status === "success") return <CheckCircle2 className="h-5 w-5 text-green-400" />;
    if (status === "error") return <XCircle className="h-5 w-5 text-red-400" />;
    return <div className="h-5 w-5 rounded-full border-2 border-white/20" />;
  }

  function StepCard({
    stepKey,
    number,
    title,
    description,
    action,
    actionLabel,
    secondaryAction,
    secondaryLabel,
  }: {
    stepKey: string;
    number: number;
    title: string;
    description: string;
    action: () => void;
    actionLabel: string;
    secondaryAction?: () => void;
    secondaryLabel?: string;
  }) {
    const step = steps[stepKey];
    return (
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3 text-white text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-black text-sm font-bold">
              {number}
            </span>
            {title}
            <span className="ml-auto"><StepIcon status={step.status} /></span>
          </CardTitle>
          <p className="text-xs text-zinc-500">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={action}
              disabled={!address || step.status === "loading"}
              className="bg-primary text-black font-bold hover:bg-primary/90"
            >
              {step.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {actionLabel}
            </Button>
            {secondaryAction && (
              <Button
                size="sm"
                variant="outline"
                onClick={secondaryAction}
                disabled={step.status === "loading"}
                className="border-white/10"
              >
                {secondaryLabel}
              </Button>
            )}
          </div>
          {step.message && (
            <p className={`mt-3 text-xs font-mono p-3 rounded-lg break-all ${
              step.status === "success" ? "bg-green-500/10 text-green-400" :
              step.status === "error" ? "bg-red-500/10 text-red-400" :
              "bg-blue-500/10 text-blue-400"
            }`}>
              {step.message}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <h1 className="text-3xl font-bold text-white mb-2">🔧 Token Admin</h1>
      <p className="text-zinc-400 mb-8">Register USDCx & USAD tokens, mint test tokens, and configure contracts.</p>

      {!address ? (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="py-8 text-center">
            <p className="text-yellow-400 font-bold">Connect your Shield wallet first using the button in the navbar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-white/5 border border-white/10 p-4 mb-6">
            <p className="text-xs text-zinc-500">Connected wallet</p>
            <p className="text-sm font-mono text-white">{address}</p>
          </div>

          <StepCard
            stepKey="regUsdcx" number={1}
            title="Register USDCx Token"
            description={`Registers ${USDCX_TOKEN_ID} as "USDCx" on token_registry.aleo`}
            action={registerUsdcx} actionLabel="Register USDCx"
            secondaryAction={() => handleCheckToken("usdcx")} secondaryLabel="Check Status"
          />

          <StepCard
            stepKey="regUsad" number={2}
            title="Register USAD Token"
            description={`Registers ${USAD_TOKEN_ID} as "USAD" on token_registry.aleo`}
            action={registerUsad} actionLabel="Register USAD"
            secondaryAction={() => handleCheckToken("usad")} secondaryLabel="Check Status"
          />

          <StepCard
            stepKey="mintUsdcx" number={3}
            title="Mint Test USDCx"
            description="Mints 1000 USDCx to your wallet (private record)"
            action={mintUsdcx} actionLabel="Mint 1000 USDCx"
          />

          <StepCard
            stepKey="mintUsad" number={4}
            title="Mint Test USAD"
            description="Mints 1000 USAD to your wallet (private record)"
            action={mintUsad} actionLabel="Mint 1000 USAD"
          />

          <StepCard
            stepKey="configEvent" number={5}
            title="Configure Event Contract"
            description={`Calls ${EVENT_PROGRAM}/configure_tokens with both token IDs`}
            action={configureEventContract} actionLabel="Configure Events"
          />

          <StepCard
            stepKey="configSubs" number={6}
            title="Configure Subscription Contract"
            description={`Calls ${SUBS_PROGRAM}/configure with treasury + token IDs`}
            action={configureSubsContract} actionLabel="Configure Subscriptions"
          />

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-6">
              <p className="text-sm font-bold text-white mb-2">📋 After all steps, update your .env:</p>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-primary">
                NEXT_PUBLIC_USDCX_TOKEN_ID={USDCX_TOKEN_ID}<br />
                NEXT_PUBLIC_USAD_TOKEN_ID={USAD_TOKEN_ID}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Then restart: <code>npm run dev</code></p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
