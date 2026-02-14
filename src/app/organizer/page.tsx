"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Calendar, Wallet, CheckCircle2, AlertCircle, Loader2, RefreshCw, MapPin, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePassMeet } from "@/context/PassMeetContext";
import { Badge } from "@/components/ui/badge";
import { getTransactionUrl, getProgramUrl, PASSMEET_V1_PROGRAM_ID } from "@/lib/aleo";

export default function OrganizerPage() {
  const { address } = useWallet();
  const { events, isLoading, createEvent, refreshEvents, isAuthenticated } = usePassMeet();
  const [loading, setLoading] = useState(false);
  const [eventName, setEventName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[PassMeet Organizer] handleCreateEvent: submit", { eventName, capacity, price, eventDate, location });
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!isAuthenticated) {
      toast.error("Please sign to verify your identity first");
      return;
    }

    setLoading(true);
    try {
      toast.info("Creating event on Aleo blockchain...");

      const txHash = await createEvent(
        eventName,
        parseInt(capacity),
        parseFloat(price),
        eventDate,
        location
      );

      // txHash is null on failure; "PENDING" = created, hash not yet; string = on-chain hash
      if (txHash !== null) {
        console.log("[PassMeet Organizer] createEvent: success", { txHash: txHash === "PENDING" ? "confirming" : txHash });
        const explorerUrl = txHash !== "PENDING" ? getTransactionUrl(txHash) : null;
        toast.success(`Event created successfully!`, {
          description: explorerUrl ? `Transaction: ${txHash.slice(0, 16)}...` : "Transaction submitted. Check your wallet for the on-chain tx ID.",
          ...(explorerUrl && {
            action: { label: "View on Explorer", onClick: () => window.open(explorerUrl, "_blank") }
          })
        });
        setEventName("");
        setCapacity("");
        setPrice("");
        setEventDate("");
        setLocation("");
      }
    } catch (error) {
      console.log("[PassMeet Organizer] createEvent: error", error);
      console.error(error);
      let errorMessage = error instanceof Error ? error.message : "Failed to create event";
      // Leo Wallet: "Could not create authorization" usually means insufficient UTXOs
      if (errorMessage.toLowerCase().includes("authorization")) {
        errorMessage =
          "Could not create authorization. Your wallet needs at least 2 separate records (UTXOs) with Aleo credits—one for the transaction and one for the fee (~0.025 credits). Try splitting your balance or getting more testnet tokens from a faucet.";
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const myEvents = events.filter(e => e.organizerAddress === address);
  const otherUserEvents = events.filter(e => e.organizerAddress !== address);
  const totalAttendees = myEvents.reduce((sum, e) => sum + e.ticketCount, 0);
  const totalCapacity = myEvents.reduce((sum, e) => sum + e.capacity, 0);

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center"
      >
        <div>
          <h1 className="text-4xl font-bold text-white">Organizer Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Create on-chain events and track entries in real-time.</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshEvents()}
            disabled={isLoading}
            className="border-white/10 bg-white/5 hover:bg-white/10"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!address && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-4 text-yellow-500 border border-yellow-500/20">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Connect wallet to manage events</span>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="border-white/10 bg-white/5 backdrop-blur-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create New Event
            </CardTitle>
            <CardDescription>Deploy a new event contract on Aleo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-400">Event Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. ZK Workshop"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="bg-black/40 border-white/10 text-white focus:border-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" className="text-zinc-400">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. San Francisco, CA"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="bg-black/40 border-white/10 text-white focus:border-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date" className="text-zinc-400">Event Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="bg-black/40 border-white/10 text-white focus:border-primary"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity" className="text-zinc-400">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="100"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="bg-black/40 border-white/10 text-white focus:border-primary"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-zinc-400">Price (Aleo)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="0.5"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-black/40 border-white/10 text-white focus:border-primary"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-11 rounded-full"
                disabled={loading || !address || !isAuthenticated}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : !address ? (
                  "Connect Wallet First"
                ) : !isAuthenticated ? (
                  "Sign to Verify First"
                ) : (
                  "Deploy Event On-Chain"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6">
            <h3 className="text-lg font-bold text-white mb-4">On-Chain Analytics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-white/5">
                <div className="text-3xl font-bold text-primary">{myEvents.length}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">My Events</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5">
                <div className="text-3xl font-bold text-white">{totalAttendees}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Tickets Sold</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5">
                <div className="text-3xl font-bold text-white">{totalCapacity}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Total Capacity</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-4">My Events</h3>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : myEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {myEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -5 }}
                    className="rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:bg-white/[0.08] hover:border-primary/30"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <Badge className="bg-primary/20 text-primary border-none font-bold">
                        {event.status}
                      </Badge>
                      <Badge variant="outline" className="border-white/10 text-xs font-mono">
                        Event #{event.id}
                      </Badge>
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-white">{event.name}</h3>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm">{event.date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-400">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">{event.location}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Users className="h-4 w-4" />
                          <span className="text-sm">{event.ticketCount}/{event.capacity}</span>
                        </div>
                        <div className="flex items-center gap-2 text-primary font-bold">
                          <Wallet className="h-4 w-4" />
                          <span className="text-sm">{event.price} Aleo</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-primary text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>On-chain</span>
                      </div>
                      <a
                        href={getProgramUrl(PASSMEET_V1_PROGRAM_ID)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-primary flex items-center gap-1"
                      >
                        View Contract <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-white/10 bg-white/5">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold text-white">No Events Yet</h3>
                <p className="mt-2 text-muted-foreground max-w-sm">
                  {address ? "Create your first on-chain event using the form." : "Connect your wallet to create events."}
                </p>
              </div>
            )}
          </div>

          {otherUserEvents.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Other On-Chain Events</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {otherUserEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    whileHover={{ y: -3 }}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-white">{event.name}</h4>
                      <Badge variant="outline" className="border-white/10 text-[10px]">
                        {event.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>{event.date}</span>
                      <span>{event.location}</span>
                      <span className="text-primary">{event.price} Aleo</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
