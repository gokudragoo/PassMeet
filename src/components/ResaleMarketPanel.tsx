"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Clock3, Copy, Loader2, Ticket as TicketIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Ticket } from "@/context/PassMeetContext";
import {
  createResaleListingId,
  dedupeLatestResaleListings,
  formatResalePrice,
  getActiveResaleRails,
  hasResalePrice,
  type ResaleListing,
  type ResalePrices,
} from "@/lib/resale";

interface ResaleMarketPanelProps {
  address?: string | null;
  isAuthenticated: boolean;
  tickets: Ticket[];
}

type ListingFormState = Record<string, { credits: string; usdcx: string; usad: string; note: string }>;

const EMPTY_FORM = { credits: "", usdcx: "", usad: "", note: "" };

export function ResaleMarketPanel({ address, isAuthenticated, tickets }: ResaleMarketPanelProps) {
  const [listings, setListings] = useState<ResaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [forms, setForms] = useState<ListingFormState>({});

  const loadListings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resale", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { listings?: ResaleListing[]; error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch resale listings.");
      }
      setListings(dedupeLatestResaleListings(data?.listings ?? []));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch resale listings");
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadListings().catch(() => {});
  }, []);

  const myOpenListings = useMemo(
    () => listings.filter((listing) => listing.sellerAddress === address && listing.status !== "cancelled"),
    [address, listings]
  );
  const marketListings = useMemo(
    () => listings.filter((listing) => listing.sellerAddress !== address && listing.status === "open"),
    [address, listings]
  );

  const listedTicketKeys = useMemo(
    () => new Set(myOpenListings.filter((listing) => listing.status === "open").map((listing) => `${listing.eventId}_${listing.ticketId}`)),
    [myOpenListings]
  );

  const publishListing = async (ticket: Ticket) => {
    if (!address) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Sign to verify your identity first");
      return;
    }

    const form = forms[ticket.id] ?? EMPTY_FORM;
    const prices: ResalePrices = {
      credits: Number(form.credits || "0"),
      usdcx: Number(form.usdcx || "0"),
      usad: Number(form.usad || "0"),
    };

    if (!hasResalePrice(prices)) {
      toast.error("Add at least one resale price.");
      return;
    }

    const now = new Date().toISOString();
    const listing: ResaleListing = {
      id: createResaleListingId(ticket.eventId, ticket.ticketId),
      eventId: ticket.eventId,
      ticketId: ticket.ticketId,
      eventName: ticket.eventName,
      date: ticket.date,
      location: ticket.location,
      sellerAddress: address,
      sellerNote: form.note.trim() || undefined,
      status: "open",
      prices,
      createdAt: now,
      updatedAt: now,
    };

    setPendingAction(ticket.id);
    try {
      const res = await fetch("/api/resale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to publish listing.");
      }
      toast.success("Resale listing published");
      setForms((prev) => ({ ...prev, [ticket.id]: EMPTY_FORM }));
      await loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish listing");
    } finally {
      setPendingAction(null);
    }
  };

  const cancelListing = async (listing: ResaleListing) => {
    setPendingAction(listing.id);
    try {
      const res = await fetch("/api/resale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...listing,
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to cancel listing.");
      }
      toast.success("Listing cancelled");
      await loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel listing");
    } finally {
      setPendingAction(null);
    }
  };

  const reserveListing = async (listing: ResaleListing) => {
    if (!address) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!isAuthenticated) {
      toast.error("Sign to verify your identity first");
      return;
    }
    setPendingAction(listing.id);
    try {
      const res = await fetch("/api/resale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...listing,
          reservedFor: address,
          status: "reserved",
          updatedAt: new Date().toISOString(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to reserve listing.");
      }
      toast.success("Listing reserved. Coordinate handoff with the seller.");
      await loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reserve listing");
    } finally {
      setPendingAction(null);
    }
  };

  const copyAddress = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Seller address copied");
    } catch {
      toast.error("Failed to copy seller address");
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-primary/20 bg-primary/10 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <ArrowRightLeft className="h-5 w-5" />
              <p className="text-sm font-bold uppercase tracking-[0.25em]">Private Resale Desk</p>
            </div>
            <h3 className="mt-3 text-2xl font-bold text-white">Secondary market intake for private tickets</h3>
            <p className="mt-2 max-w-3xl text-sm text-zinc-300">
              Listings, reserve intent, and multi-currency price discovery are live. Final transfer settlement still depends on a future contract rollout because the currently deployed testnet program does not expose a ticket-transfer transition.
            </p>
          </div>
          <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => loadListings()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Board"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">List One Of Your Tickets</h3>
          {tickets.filter((ticket) => ticket.status === "Valid").length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-400">
              You need a valid ticket before you can publish a resale listing.
            </div>
          ) : (
            tickets
              .filter((ticket) => ticket.status === "Valid")
              .map((ticket) => {
                const form = forms[ticket.id] ?? EMPTY_FORM;
                const alreadyListed = listedTicketKeys.has(`${ticket.eventId}_${ticket.ticketId}`);
                return (
                  <div key={ticket.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <TicketIcon className="h-5 w-5 text-primary" />
                          <h4 className="text-lg font-bold text-white">{ticket.eventName}</h4>
                          {alreadyListed && <Badge className="border-none bg-primary/20 text-primary">Listed</Badge>}
                        </div>
                        <p className="mt-2 text-sm text-zinc-400">{ticket.date || "Date pending"} - {ticket.location || "Location pending"}</p>
                        <p className="mt-1 text-xs text-zinc-500">Event #{ticket.eventId} / Ticket #{ticket.ticketId}</p>
                      </div>
                    </div>
                    {!alreadyListed && (
                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <Input
                          placeholder="Credits"
                          value={form.credits}
                          type="number"
                          min={0}
                          step="0.01"
                          className="border-white/10 bg-black/40 text-white"
                          onChange={(e) => setForms((prev) => ({ ...prev, [ticket.id]: { ...form, credits: e.target.value } }))}
                        />
                        <Input
                          placeholder="USDCx"
                          value={form.usdcx}
                          type="number"
                          min={0}
                          step="0.01"
                          className="border-white/10 bg-black/40 text-white"
                          onChange={(e) => setForms((prev) => ({ ...prev, [ticket.id]: { ...form, usdcx: e.target.value } }))}
                        />
                        <Input
                          placeholder="USAD"
                          value={form.usad}
                          type="number"
                          min={0}
                          step="0.01"
                          className="border-white/10 bg-black/40 text-white"
                          onChange={(e) => setForms((prev) => ({ ...prev, [ticket.id]: { ...form, usad: e.target.value } }))}
                        />
                        <Input
                          placeholder="Seller note or handoff instructions"
                          value={form.note}
                          className="border-white/10 bg-black/40 text-white md:col-span-2"
                          onChange={(e) => setForms((prev) => ({ ...prev, [ticket.id]: { ...form, note: e.target.value } }))}
                        />
                        <Button onClick={() => publishListing(ticket)} disabled={pendingAction === ticket.id} className="bg-primary text-black hover:bg-primary/90">
                          {pendingAction === ticket.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish Listing"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Market Board</h3>
          {loading ? (
            <div className="flex justify-center rounded-3xl border border-white/10 bg-white/5 p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : marketListings.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-400">
              No open resale listings yet. Sellers can publish from their ticket inventory.
            </div>
          ) : (
            marketListings.map((listing) => (
              <div key={listing.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-white">{listing.eventName}</h4>
                    <p className="mt-1 text-sm text-zinc-400">{listing.date || "Date pending"} - {listing.location || "Location pending"}</p>
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary">
                    {listing.status}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {getActiveResaleRails(listing.prices).map((rail) => (
                    <Badge key={rail} className="border-none bg-white/10 text-zinc-200">
                      {formatResalePrice(listing.prices, rail)}
                    </Badge>
                  ))}
                </div>
                {listing.sellerNote && (
                  <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">{listing.sellerNote}</p>
                )}
                <div className="mt-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Clock3 className="h-4 w-4" />
                    Seller: {listing.sellerAddress.slice(0, 10)}...{listing.sellerAddress.slice(-4)}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => copyAddress(listing.sellerAddress)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Seller Address
                    </Button>
                    <Button className="bg-primary text-black hover:bg-primary/90" onClick={() => reserveListing(listing)} disabled={pendingAction === listing.id || !address || !isAuthenticated}>
                      {pendingAction === listing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reserve Listing"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          {myOpenListings.length > 0 && (
            <div className="space-y-3 rounded-3xl border border-white/10 bg-black/30 p-6">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">My Active Listings</h4>
              {myOpenListings.map((listing) => (
                <div key={listing.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{listing.eventName}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {listing.status === "reserved" && listing.reservedFor
                          ? `Reserved for ${listing.reservedFor.slice(0, 10)}...${listing.reservedFor.slice(-4)}`
                          : "Open for matching"}
                      </p>
                    </div>
                    <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => cancelListing(listing)} disabled={pendingAction === listing.id}>
                      {pendingAction === listing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
