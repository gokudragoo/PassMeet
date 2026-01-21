"use client";

import { useState, useEffect, ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { PuzzleWalletProvider as Provider } from "@puzzlehq/sdk";
import { PassMeetProvider } from "@/context/PassMeetContext";
import { SplashScreen } from "@/components/SplashScreen";

export function PuzzleWalletProvider({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [mounted, setMounted] = useState(false);

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
    <Provider>
      <PassMeetProvider>
        <AnimatePresence mode="wait">
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
        </AnimatePresence>
        {!showSplash && children}
      </PassMeetProvider>
    </Provider>
  );
}
