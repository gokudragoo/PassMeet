"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ScanLine, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Camera,
  ChevronRight,
  Wallet,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { usePassMeet, Ticket } from "@/context/PassMeetContext";
import { getTransactionUrl } from "@/lib/aleo";

interface VerificationData {
  eventId: string;
  eventName: string;
  timestamp: string;
  network: string;
  txHash: string;
}

export default function GatePage() {
  const { address } = useWallet();
  const { myTickets, verifyEntry, isAuthenticated } = usePassMeet();
  const [status, setStatus] = useState<"idle" | "selecting" | "verifying" | "success" | "error">("idle");
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);

  const handleStartScan = () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }
    if (myTickets.length === 0) {
      toast.error("No tickets found in your wallet");
      return;
    }
    setStatus("selecting");
  };

  const handleSelectTicket = async (ticket: Ticket) => {
    console.log("[PassMeet Gate] handleSelectTicket: start", { ticketId: ticket.id, eventName: ticket.eventName });
    setStatus("verifying");
    toast.info("Generating Zero-Knowledge Proof...");

    try {
      const txId = await verifyEntry(ticket);
      console.log("[PassMeet Gate] verifyEntry: result", { txId });
      
      if (txId) {
        setVerificationData({
          eventId: ticket.eventId,
          eventName: ticket.eventName,
          timestamp: new Date().toLocaleTimeString(),
          network: "Aleo Testnet",
          txHash: txId
        });
        setStatus("success");
        console.log("[PassMeet Gate] verifyEntry: success", { txHash: txId });
        toast.success("ZK-Proof Verified! Access Granted.");
      } else {
        setStatus("error");
        console.log("[PassMeet Gate] verifyEntry: failed (no txId)");
        toast.error("Verification failed");
      }
    } catch (error) {
      console.log("[PassMeet Gate] verifyEntry: error", error);
      console.error(error);
      setStatus("error");
      const errorMessage = error instanceof Error ? error.message : "Invalid or Used Proof! Access Denied.";
      toast.error(errorMessage);
    }
  };

  const reset = () => {
    setStatus("idle");
    setVerificationData(null);
  };

  return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-20 min-h-[80vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl text-center"
      >
        <h1 className="text-4xl font-bold text-white mb-4">Gate Scanner</h1>
        <p className="text-muted-foreground mb-12">
          Verify attendee ZK-proofs on-chain. No identity revealed, only validity confirmed.
        </p>

        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center"
            >
              <div 
                className="relative mb-8 flex h-64 w-64 items-center justify-center rounded-3xl border-2 border-dashed border-white/20 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                onClick={handleStartScan}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="h-16 w-16 text-muted-foreground opacity-20" />
                </div>
                <div className="z-10 flex flex-col items-center">
                  <ScanLine className="h-12 w-12 text-primary animate-pulse" />
                  <span className="mt-4 font-bold text-white">Start Verification</span>
                </div>
              </div>
              <Button 
                size="lg" 
                className="rounded-full bg-primary px-12 text-black font-bold h-12"
                onClick={handleStartScan}
                  disabled={!address}
                >
                  {!address ? (
                  <>
                    <Wallet className="mr-2 h-5 w-5" />
                    Connect Wallet First
                  </>
                ) : (
                  "Select Ticket to Verify"
                )}
              </Button>
            </motion.div>
          )}

          {status === "selecting" && (
            <motion.div
              key="selecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <h3 className="text-xl font-bold text-white mb-6">Select a ticket to verify</h3>
              <div className="space-y-4">
                {myTickets.filter(t => t.status === "Valid").map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-6 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => handleSelectTicket(ticket)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-black">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-white">{ticket.eventName}</h4>
                        <p className="text-sm text-muted-foreground">Ticket #{ticket.ticketId}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </motion.div>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-6 border-white/10"
                onClick={reset}
              >
                Cancel
              </Button>
            </motion.div>
          )}

          {status === "verifying" && (
            <motion.div
              key="verifying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="relative mb-8 flex h-64 w-64 items-center justify-center overflow-hidden rounded-3xl bg-zinc-900 border border-primary/50">
                <div className="absolute inset-0 bg-primary/5" />
                <motion.div
                  className="absolute top-0 h-1 w-full bg-primary shadow-[0_0_15px_rgba(29,185,84,0.8)]"
                  animate={{ top: ["0%", "100%", "0%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <div className="flex flex-col items-center text-primary">
                  <Loader2 className="h-12 w-12 animate-spin mb-4" />
                  <span className="font-mono text-sm uppercase tracking-widest font-bold">
                    Verifying ZK-Proof...
                  </span>
                </div>
              </div>
              <p className="text-zinc-500 font-mono text-xs max-w-xs">
                Submitting nullifier to Aleo blockchain for on-chain verification...
              </p>
            </motion.div>
          )}

          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full"
            >
              <Card className="border-primary/50 bg-primary/5 backdrop-blur-md overflow-hidden">
                <div className="h-2 w-full bg-primary" />
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary text-black">
                    <CheckCircle2 className="h-12 w-12" />
                  </div>
                  <CardTitle className="text-3xl font-bold text-primary">ACCESS GRANTED</CardTitle>
                  <CardDescription className="text-white/60">Verified On-Chain via Aleo Testnet</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8 pt-4">
                  <div className="space-y-4 rounded-xl bg-black/40 p-6 border border-white/10">
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-zinc-500 text-sm uppercase font-bold tracking-wider">Event</span>
                      <span className="text-white font-bold">{verificationData?.eventName}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-zinc-500 text-sm uppercase font-bold tracking-wider">Time</span>
                      <span className="text-white font-mono">{verificationData?.timestamp}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <span className="text-zinc-500 text-sm uppercase font-bold tracking-wider">Transaction</span>
                      <a
                        href={verificationData?.txHash ? (getTransactionUrl(verificationData.txHash) ?? "#") : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-mono text-xs flex items-center gap-1 ${getTransactionUrl(verificationData.txHash) ? "text-primary hover:underline" : "text-muted-foreground cursor-default"}`}
                      >
                        {verificationData?.txHash?.slice(0, 16)}...
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 text-sm uppercase font-bold tracking-wider">Privacy Mode</span>
                      <Badge className="bg-primary/20 text-primary border-none">Anonymous</Badge>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-8 bg-primary text-black font-bold h-12 rounded-full"
                    onClick={reset}
                  >
                    Verify Another Ticket
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full"
            >
              <Card className="border-destructive/50 bg-destructive/5 backdrop-blur-md overflow-hidden">
                <div className="h-2 w-full bg-destructive" />
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-white">
                    <XCircle className="h-12 w-12" />
                  </div>
                  <CardTitle className="text-3xl font-bold text-destructive uppercase tracking-tighter">Access Denied</CardTitle>
                  <CardDescription className="text-white/60">Verification Failed</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8 pt-4">
                  <div className="space-y-4 rounded-xl bg-black/40 p-8 border border-white/10 text-center">
                    <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-2 opacity-50" />
                    <p className="text-white font-medium">
                      This ticket proof is either invalid, expired, or has already been used for entry.
                    </p>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full mt-8 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold h-12 rounded-full"
                    onClick={reset}
                  >
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 text-center">
            <ScanLine className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">On-Chain Verification</h4>
            <p className="text-xs text-zinc-500">All proofs are verified directly on the Aleo blockchain.</p>
          </div>
          <div className="p-4 text-center border-x border-white/5">
            <ShieldCheck className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">ZK-Security</h4>
            <p className="text-xs text-zinc-500">Proof-of-entry without revealing any wallet data.</p>
          </div>
          <div className="p-4 text-center">
            <Badge className="bg-primary/10 text-primary border-none mb-2">NULLIFIER</Badge>
            <h4 className="text-sm font-bold text-white mb-1">Single Use</h4>
            <p className="text-xs text-zinc-500">Each ticket can only be verified once on-chain.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
