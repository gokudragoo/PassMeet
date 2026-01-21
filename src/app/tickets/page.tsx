"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { 
  Ticket as TicketIcon, 
  Calendar, 
  MapPin, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  CheckCircle2,
  Lock,
  QrCode,
  Users,
  RefreshCw,
  Wallet,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePassMeet, Ticket } from "@/context/PassMeetContext";

export default function TicketsPage() {
  const { publicKey } = useWallet();
  const { events, myTickets, isLoading, buyTicket, verifyEntry, refreshEvents, refreshTickets, isAuthenticated } = usePassMeet();
  const [loading, setLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("available");

  const handleBuyTicket = async (eventId: string) => {
    if (!publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }

    setLoading(`buy-${eventId}`);
    try {
      toast.info("Minting private ticket on Aleo...", {
        description: "Generating ZK proof for anonymous ownership"
      });
      
      const event = events.find(e => e.id === eventId);
      if (!event) {
        toast.error("Event not found");
        return;
      }
      
      const txId = await buyTicket(event);
      
      if (txId) {
        toast.success("Ticket minted successfully!", {
          description: `Transaction: ${txId.slice(0, 16)}...`,
          action: {
            label: "View",
            onClick: () => window.open(`https://explorer.provable.com/testnet/transaction/${txId}`, "_blank")
          }
        });
        setActiveTab("tickets");
      }
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Transaction failed";
      toast.error(errorMessage);
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateProof = async (ticket: Ticket) => {
    setLoading(`proof-${ticket.id}`);
    try {
      toast.info("Generating Zero-Knowledge Entry Proof...", {
        description: "Your identity remains hidden from the verifier"
      });
      
      const txId = await verifyEntry(ticket);
      
      if (txId) {
        toast.success("Entry verified! Access granted.", {
          description: "ZK proof accepted - your wallet address was never revealed"
        });
      }
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate proof";
      toast.error(errorMessage);
    } finally {
      setLoading(null);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([refreshEvents(), refreshTickets()]);
    toast.success("Data refreshed");
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white">Attendee Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Browse events and manage your private tickets.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="border-white/10 bg-white/5 hover:bg-white/10 w-fit"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-8 grid w-full max-w-md grid-cols-2 bg-white/5 border border-white/10 p-1 rounded-full">
          <TabsTrigger value="available" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-black font-bold">
            Available Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-black font-bold">
            My Tickets
            {myTickets.length > 0 && (
              <Badge className="ml-2 bg-black text-white border-none h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {myTickets.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : events.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -5 }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:border-primary/50 hover:bg-white/[0.08]"
                >
                  <div className="relative h-48 w-full overflow-hidden">
                    <img src={event.image} alt={event.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                      <Badge className="bg-primary text-black font-bold border-none">
                        {event.price} Aleo
                      </Badge>
                      <span className="text-xs text-white/70 font-medium bg-black/50 backdrop-blur-md px-2 py-1 rounded-md flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {event.ticketCount}/{event.capacity}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">{event.name}</h3>
                      <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">ZK</Badge>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {event.date}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </div>
                    </div>
                    <div className="mt-auto pt-6">
                      <Button 
                        className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-11 rounded-full"
                        onClick={() => handleBuyTicket(event.id)}
                        disabled={loading === `buy-${event.id}` || !publicKey || event.ticketCount >= event.capacity}
                      >
                        {loading === `buy-${event.id}` ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Minting...
                          </>
                        ) : !publicKey ? (
                          <>
                            <Wallet className="mr-2 h-4 w-4" />
                            Connect Wallet
                          </>
                        ) : event.ticketCount >= event.capacity ? (
                          "Sold Out"
                        ) : (
                          <>
                            Mint Private Ticket
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-bold text-white">No Events Available</h3>
              <p className="mt-2 text-muted-foreground max-w-sm">
                There are no events available yet. Be the first to create one!
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tickets">
          <div className="grid gap-6">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : myTickets.length > 0 ? (
              myTickets.map((ticket) => (
                <motion.div
                  key={ticket.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 md:flex-row"
                >
                  <div className="relative flex flex-col items-center justify-center bg-primary p-8 md:w-48">
                    <div className="absolute top-0 -mt-4 flex h-8 w-full justify-around md:hidden">
                      {[...Array(10)].map((_, i) => (
                        <div key={i} className="h-8 w-4 rounded-full bg-background" />
                      ))}
                    </div>
                    <TicketIcon className="h-16 w-16 text-black" />
                    <span className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-black/60">
                      PASSMEET-{ticket.id.slice(-8)}
                    </span>
                    <div className="absolute right-0 top-0 -mr-4 hidden h-full w-8 flex-col justify-around md:flex">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-4 w-8 rounded-full bg-background" />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-8">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-2xl font-bold text-white">{ticket.eventName}</h3>
                          <Badge variant="outline" className="border-primary/50 text-primary">
                            <Lock className="mr-1 h-3 w-3" />
                            Private
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{ticket.location}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {ticket.status === "Valid" ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Valid
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
                            Used
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-8">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Date</p>
                        <p className="mt-1 font-medium text-white">{ticket.date}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Network</p>
                        <p className="mt-1 font-medium text-white">Aleo Testnet</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Security</p>
                        <div className="mt-1 flex items-center gap-1 font-medium text-primary">
                          <ShieldCheck className="h-4 w-4" />
                          ZK-Proof Enabled
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Tx Hash</p>
                        <a 
                          href={`https://explorer.provable.com/testnet/transaction/${ticket.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 font-mono text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          {ticket.txHash.slice(0, 16)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-end">
                      <Button 
                        variant="outline" 
                        className="border-white/10 bg-white/5 font-bold hover:bg-white/10 text-white rounded-full"
                        onClick={() => handleGenerateProof(ticket)}
                        disabled={loading === `proof-${ticket.id}` || ticket.status === "Used"}
                      >
                        {loading === `proof-${ticket.id}` ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating ZK Proof...
                          </>
                        ) : ticket.status === "Used" ? (
                          "Already Used"
                        ) : (
                          <>
                            <QrCode className="mr-2 h-4 w-4" />
                            Generate Entry Proof
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-muted-foreground">
                  <TicketIcon className="h-10 w-10" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-white">No Tickets Yet</h3>
                <p className="mt-2 max-w-sm text-muted-foreground">
                  {publicKey ? "You haven't minted any tickets yet. Browse available events to get started." : "Connect your wallet to view your tickets."}
                </p>
                {publicKey && (
                  <Button 
                    className="mt-8 bg-primary text-black font-bold rounded-full"
                    onClick={() => setActiveTab("available")}
                  >
                    Explore Events
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
