"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Ticket, 
  ShieldCheck, 
  Lock, 
  Zap, 
  ScanLine, 
  ArrowRight,
  Globe,
  Users
} from "lucide-react";

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(29,185,84,0.15),transparent_50%)]" />
        
        {/* Floating Stickers */}
        <motion.div
          animate={{ 
            y: [0, -20, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-[10%] hidden lg:block opacity-20 pointer-events-none"
        >
          <div className="bg-primary/20 backdrop-blur-xl border border-primary/30 p-4 rounded-2xl rotate-12">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
        </motion.div>

        <motion.div
          animate={{ 
            y: [0, 20, 0],
            rotate: [0, -5, 5, 0]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-40 right-[15%] hidden lg:block opacity-20 pointer-events-none"
        >
          <div className="bg-primary/20 backdrop-blur-xl border border-primary/30 p-4 rounded-2xl -rotate-12">
            <Ticket className="h-8 w-8 text-primary" />
          </div>
        </motion.div>

        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex flex-col items-center text-center"
          >
            <motion.div variants={itemVariants} className="mb-6 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              Built on Aleo Testnet
            </motion.div>
            
            <motion.h1 variants={itemVariants} className="max-w-4xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent md:text-7xl lg:text-8xl">
              Private Event Access <br />
              <span className="text-primary">Without Compromise</span>
            </motion.h1>
            
            <motion.p variants={itemVariants} className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Enter events. Prove your ticket. Reveal nothing else. 
              The world&apos;s first privacy-first event platform powered by Zero-Knowledge proofs.
            </motion.p>
            
            <motion.div variants={itemVariants} className="mt-12 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="h-12 rounded-full bg-primary px-8 text-lg font-bold text-black hover:bg-primary/90" asChild>
                <Link href="/tickets">
                  Get Tickets
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 rounded-full border-white/10 bg-white/5 px-8 text-lg font-bold hover:bg-white/10" asChild>
                <Link href="/organizer">Create Event</Link>
              </Button>
            </motion.div>

            <motion.div 
              variants={itemVariants}
              className="relative mt-20 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm"
            >
              <div className="flex items-center border-b border-white/10 bg-white/5 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/50" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                  <div className="h-3 w-3 rounded-full bg-green-500/50" />
                </div>
                <div className="ml-4 text-xs font-mono text-muted-foreground">aleo-zk-verification.exe</div>
              </div>
              <div className="aspect-video w-full bg-gradient-to-br from-zinc-900 to-black p-8 text-left font-mono text-sm leading-relaxed text-zinc-400">
                <div className="flex gap-2">
                  <span className="text-primary">$</span>
                  <span className="text-white">aleo run verify_entry ticket_record.json</span>
                </div>
                <div className="mt-2 text-zinc-500">{"// Generating Zero-Knowledge Proof..."}</div>
                <div className="mt-1 text-zinc-500">{"// Hiding wallet address: aleo1...4v2z"}</div>
                <div className="mt-1 text-zinc-500">{"// Hiding transaction history..."}</div>
                <div className="mt-4 flex items-center gap-2 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Success: Proof Verified locally on Aleo.</span>
                </div>
                <div className="mt-1 text-white">Status: Access Granted. Welcome to the event!</div>
                
                <div className="mt-12 flex flex-wrap gap-8 opacity-50">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>Private State</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span>Instant Verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Anonymous Presence</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-zinc-950 py-24">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold text-white md:text-5xl">The Core Advantages</h2>
            <p className="mt-4 text-muted-foreground">Why traditional tickets are broken, and how Aleo fixes them.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Zero-Knowledge Privacy",
                description: "Prove you have a valid ticket without revealing your wallet address or any personal data to the organizer.",
                icon: ShieldCheck,
                color: "text-primary"
              },
              {
                title: "Non-Transferable",
                description: "Tickets are cryptographically bound to your identity on Aleo, preventing unauthorized resale and fraud.",
                icon: Lock,
                color: "text-blue-500"
              },
              {
                title: "Instant Verification",
                description: "Optimized proof generation ensures gate scanning is as fast as traditional QR codes, but 100x more secure.",
                icon: Zap,
                color: "text-yellow-500"
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -5 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 transition-colors hover:bg-white/[0.08]"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 transition-transform group-hover:scale-110`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold text-white md:text-5xl">Simple User Flow</h2>
            <p className="mt-4 text-muted-foreground">From buying to entering, privacy is baked into every step.</p>
          </div>

          <div className="relative">
            <div className="absolute left-1/2 top-0 hidden h-full w-px bg-white/10 md:block" />
            
            {[
              {
                title: "Organizers Create",
                description: "Deploy an event contract on Aleo with specific rules and capacity. Total privacy for both parties.",
                side: "left",
                icon: LayoutDashboard
              },
              {
                title: "Attendees Buy",
                description: "Mint a private ticket record. Your ownership is hidden from everyone but yourself.",
                side: "right",
                icon: Ticket
              },
              {
                title: "Generate Proof",
                description: "When at the gate, generate a one-time ZK proof of entry. No wallet exposure.",
                side: "left",
                icon: ScanLine
              },
              {
                title: "Enter Seamlessly",
                description: "Gate verifies the proof on-chain and grants access. Your presence remains anonymous.",
                side: "right",
                icon: Globe
              }
            ].map((step, idx) => (
              <div key={idx} className={`relative mb-12 flex flex-col md:mb-24 md:flex-row ${step.side === 'right' ? 'md:flex-row-reverse' : ''}`}>
                <div className="flex-1 md:px-12">
                  <motion.div 
                    initial={{ opacity: 0, x: step.side === 'left' ? -20 : 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className={`rounded-2xl border border-white/10 bg-white/5 p-8 ${step.side === 'right' ? 'md:text-right' : ''}`}
                  >
                    <div className={`mb-4 flex ${step.side === 'right' ? 'md:justify-end' : ''}`}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-black">
                        {idx + 1}
                      </span>
                    </div>
                    <h3 className="mb-2 text-2xl font-bold text-white">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </motion.div>
                </div>
                <div className="flex-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10 bg-primary/10" />
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white md:text-5xl">Ready for the Future of Events?</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Join the Aleo ecosystem and build privacy-preserving applications today.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" className="rounded-full bg-primary px-8 text-lg font-bold text-black" asChild>
              <Link href="/organizer">Start Organizing</Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full border-white/20 bg-black/40 px-8 text-lg font-bold backdrop-blur-sm" asChild>
              <Link href="/tickets">View Events</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LayoutDashboard({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}
