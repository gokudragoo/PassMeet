"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Ticket, ShieldCheck, Loader2 } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Initializing...");

  useEffect(() => {
    const texts = [
      "Initializing...",
      "Connecting to Aleo Testnet...",
      "Loading ZK modules...",
      "Preparing wallet interface...",
      "Ready!"
    ];

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15 + 5;
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        setLoadingText(texts[4]);
        clearInterval(interval);
        setTimeout(onComplete, 500);
      } else {
        setProgress(currentProgress);
        const textIndex = Math.min(Math.floor(currentProgress / 25), 3);
        setLoadingText(texts[textIndex]);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(29,185,84,0.1),transparent_50%)]" />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative flex flex-col items-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="relative"
        >
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary">
            <Ticket className="h-12 w-12 text-black" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-4xl font-bold text-white"
        >
          PassMeet
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-2 text-muted-foreground"
        >
          Privacy-First Event Ticketing
        </motion.p>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-12 w-64"
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute left-0 top-0 h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {progress < 100 && <Loader2 className="h-4 w-4 animate-spin" />}
            {progress === 100 && <ShieldCheck className="h-4 w-4 text-primary" />}
            <span>{loadingText}</span>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        Powered by Aleo Zero-Knowledge Proofs
      </motion.div>
    </motion.div>
  );
}
