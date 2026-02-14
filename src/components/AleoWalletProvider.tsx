"use client";

import { useState, useEffect, useMemo, ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { AleoWalletProvider as ProvableWalletProvider } from "@provablehq/aleo-wallet-adaptor-react";
import { WalletModalProvider } from "@provablehq/aleo-wallet-adaptor-react-ui";
import { LeoWalletAdapter } from "@provablehq/aleo-wallet-adaptor-leo";
import { PuzzleWalletAdapter } from "@provablehq/aleo-wallet-adaptor-puzzle";
import { FoxWalletAdapter } from "@provablehq/aleo-wallet-adaptor-fox";
import { ShieldWalletAdapter } from "@provablehq/aleo-wallet-adaptor-shield";
import { Network } from "@provablehq/aleo-types";
import { DecryptPermission } from "@provablehq/aleo-wallet-adaptor-core";
import { PassMeetProvider } from "@/context/PassMeetContext";
import { SplashScreen } from "@/components/SplashScreen";
import { ALEO_NETWORK, PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID } from "@/lib/aleo";

import "@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css";

const programs = [PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID, "credits.aleo"];

export function AleoWalletProvider({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [mounted, setMounted] = useState(false);

  const wallets = useMemo(() => {
    if (typeof window === "undefined") return [];
    return [
      new LeoWalletAdapter(),
      new PuzzleWalletAdapter(),
      new FoxWalletAdapter(),
      new ShieldWalletAdapter(),
    ];
  }, []);

  useEffect(() => {
    setMounted(true);
    const hasSeenSplash = sessionStorage.getItem("passmeet_splash_seen");
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem("passmeet_splash_seen", "true");
    setShowSplash(false);
  };

  if (!mounted) {
    return null;
  }

  return (
    <ProvableWalletProvider
      wallets={wallets}
      network={ALEO_NETWORK === "mainnet" ? Network.MAINNET : Network.TESTNET}
      autoConnect={true}
      decryptPermission={DecryptPermission.UponRequest}
      programs={programs}
      onError={(error) => console.error("Wallet error:", error.message)}
    >
      <WalletModalProvider>
        <PassMeetProvider>
          <AnimatePresence mode="wait">
            {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          </AnimatePresence>
          {!showSplash && children}
        </PassMeetProvider>
      </WalletModalProvider>
    </ProvableWalletProvider>
  );
}
