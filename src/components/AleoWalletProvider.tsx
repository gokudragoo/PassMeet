"use client";

import { useState, useEffect, ReactNode, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { WalletProvider } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletModalProvider } from "@demox-labs/aleo-wallet-adapter-reactui";
import { DecryptPermission, WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PassMeetProvider } from "@/context/PassMeetContext";
import { SplashScreen } from "@/components/SplashScreen";
import { PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID } from "@/lib/aleo";

import "@demox-labs/aleo-wallet-adapter-reactui/styles.css";

export function AleoWalletProvider({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hasSeenSplash = sessionStorage.getItem("passmeet_splash_seen");
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);

  const programs = useMemo(() => [
    PASSMEET_V1_PROGRAM_ID, 
    PASSMEET_SUBS_PROGRAM_ID, 
    "credits.aleo"
  ], []);

  const wallets = useMemo(() => {
    if (typeof window === "undefined") return [];
    
    const { LeoWalletAdapter, FoxWalletAdapter, PuzzleWalletAdapter } = require("aleo-adapters");
    
    return [
      new LeoWalletAdapter({
        appName: "PassMeet",
      }),
      new FoxWalletAdapter({
        appName: "PassMeet",
      }),
      new PuzzleWalletAdapter({
        appName: "PassMeet",
        appDescription: "Private Event Access & Ticket Verification on Aleo",
        appIconUrl: "https://passmeet.vercel.app/logo.png",
        programIdPermissions: {
          [WalletAdapterNetwork.TestnetBeta]: programs,
          [WalletAdapterNetwork.Testnet]: programs,
        },
      }),
    ];
  }, [programs]);

  const handleSplashComplete = () => {
    sessionStorage.setItem("passmeet_splash_seen", "true");
    setShowSplash(false);
  };

  if (!mounted) {
    return null;
  }

  return (
    <WalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.UponRequest}
      network={WalletAdapterNetwork.Testnet}
      programs={programs}
      autoConnect
    >
      <WalletModalProvider>
        <PassMeetProvider>
          <AnimatePresence mode="wait">
            {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          </AnimatePresence>
          {!showSplash && children}
        </PassMeetProvider>
      </WalletModalProvider>
    </WalletProvider>
  );
}
