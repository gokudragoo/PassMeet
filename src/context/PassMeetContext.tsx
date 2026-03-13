"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID, CREDITS_PROGRAM_ID } from "@/lib/aleo";
import { getEventCounter, getEvent } from "@/lib/aleo-rpc";

export type PaymentRail = "credits" | "usdcx" | "usad";

export interface Event {
  id: string;
  name: string;
  organizer: string;
  organizerAddress: string;
  capacity: number;
  ticketCount: number;
  price: number;
  priceCredits: number;
  priceUsdcx: number;
  priceUsad: number;
  supportedRails: PaymentRail[];
  date: string;
  location: string;
  image: string;
  status: "Active" | "Ended" | "Upcoming";
}

export interface Ticket {
  id: string;
  eventId: string;
  ticketId: string;
  eventName: string;
  date: string;
  location: string;
  status: "Valid" | "Used";
  txHash: string;
  nullifier: string;
  recordString?: string;
}

interface PassMeetContextType {
  events: Event[];
  myTickets: Ticket[];
  isLoading: boolean;
  isDataLoading: boolean;
  isAuthenticated: boolean;
  authenticateWithSignature: () => Promise<boolean>;
  createEvent: (name: string, capacity: number, priceCredits: number, priceUsdcx: number, priceUsad: number, eventDate: string, eventLocation: string) => Promise<string | null>;
  buyTicket: (event: Event, rail?: PaymentRail) => Promise<string | null>;
  verifyEntry: (ticket: Ticket) => Promise<string | null>;
  refreshEvents: (opts?: { silent?: boolean }) => Promise<void>;
  refreshTickets: (opts?: { silent?: boolean }) => Promise<number>;
}

const PassMeetContext = createContext<PassMeetContextType | null>(null);

export function usePassMeet() {
  const context = useContext(PassMeetContext);
  if (!context) {
    throw new Error("usePassMeet must be used within a PassMeetProvider");
  }
  return context;
}

interface PassMeetProviderProps {
  children: ReactNode;
}

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=800";
const LOG = (msg: string, _data?: unknown) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[PassMeet] ${msg}`, _data ?? "");
  }
};

/** Parse microcredits amount from a credits.aleo record (string or object). Returns null if not found. */
function getMicrocreditsFromCreditsRecord(recordItem: unknown): number | null {
  try {
    const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
    const match = str.match(/microcredits["\s:]+(\d+)u64/);
    if (match) return parseInt(match[1], 10);
    const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
    const data = record?.data ?? record?.plaintext ?? record;
    const raw = data?.microcredits ?? data?.microcredits?.value ?? record?.microcredits;
    if (raw != null) return typeof raw === "number" ? raw : parseInt(String(raw).replace(/\D/g, ""), 10) || null;
    return null;
  } catch {
    return null;
  }
}

/** Map common wallet/chain errors to user-friendly messages. */
function mapWalletError(error: unknown): string {
  const msg = (error as Error)?.message?.toLowerCase() ?? "";
  if (msg.includes("reject") || msg.includes("denied") || msg.includes("user denied")) {
    return "Transaction was rejected. Please approve in your wallet to continue.";
  }
  if (msg.includes("insufficient") || msg.includes("balance") || msg.includes("not enough")) {
    return "Insufficient balance. You need Aleo credits for fees (~0.025). Get testnet tokens from a faucet.";
  }
  if (msg.includes("authorization") || msg.includes("utxo")) {
    return "Your wallet needs at least 2 separate records (UTXOs) with Aleo credits—one for the transaction and one for the fee (~0.025). Try splitting your balance or getting more testnet tokens.";
  }
  if (msg.includes("not_granted") || msg.includes("not granted")) {
    return "Record access was denied. Disconnect your wallet and reconnect, then approve record access for this app.";
  }
  return (error as Error)?.message ?? "Something went wrong. Please try again.";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------------------
// Metadata helpers
// ---------------------

interface EventMetadataCache {
  name: string;
  date: string;
  location: string;
  image?: string;
  organizer?: string;
}

/** Fetch ALL event metadata from IPFS (single request). Returns a map keyed by event ID string. */
async function fetchAllEventMetadata(): Promise<Record<string, EventMetadataCache>> {
  try {
    const res = await fetch("/api/events");
    if (!res.ok) return {};
    const { events: ipfsEvents } = await res.json();
    if (!Array.isArray(ipfsEvents)) return {};

    const map: Record<string, EventMetadataCache> = {};
    for (const e of ipfsEvents) {
      if (e?.id != null) {
        map[String(e.id)] = {
          name: e.name || "",
          date: e.date || "",
          location: e.location || "",
          image: e.image || undefined,
          organizer: e.organizer || undefined,
        };
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** Read localStorage-cached metadata map */
function getLocalMetadata(): Record<string, { name: string; date: string; location: string }> {
  try {
    const stored = localStorage.getItem("passmeet_event_metadata");
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/** Save metadata to localStorage cache */
function saveLocalMetadata(id: string, meta: { name: string; date: string; location: string }) {
  const map = getLocalMetadata();
  map[id] = meta;
  localStorage.setItem("passmeet_event_metadata", JSON.stringify(map));
}

const TICKETS_STORAGE_PREFIX = "passmeet_my_tickets_";

function getTicketsFromLocalStorage(address: string): Ticket[] {
  try {
    const stored = localStorage.getItem(`${TICKETS_STORAGE_PREFIX}${address}`);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTicketsToLocalStorage(address: string, tickets: Ticket[]) {
  try {
    localStorage.setItem(`${TICKETS_STORAGE_PREFIX}${address}`, JSON.stringify(tickets));
  } catch {
    // ignore quota or parse errors
  }
}

// ---------------------
// Provider
// ---------------------

/** Aleo on-chain tx IDs: at1... 61+ chars. Temp UUIDs from wallet are invalid for explorer. */
function isOnChainTxHash(id: string): boolean {
  return typeof id === "string" && id.startsWith("at1") && id.length >= 61;
}

export type TxState = "submitted" | "confirmed" | "timed_out" | "failed" | "rejected";

/** Poll for final ON-CHAIN transaction ID (at1...). Returns state + hash. Never treats null as success. */
async function pollForTxHash(
  tempId: string,
  transactionStatus: (id: string) => Promise<{ status: string; transactionId?: string; error?: string }>,
  maxAttempts = 90,
  firstPhaseAttempts = 10,
  firstPhaseDelayMs = 1000,
  secondPhaseDelayMs = 2000
): Promise<{ state: TxState; txHash: string | null }> {
  for (let i = 0; i < maxAttempts; i++) {
    const delay = i < firstPhaseAttempts ? firstPhaseDelayMs : secondPhaseDelayMs;
    await new Promise((r) => setTimeout(r, delay));
    const res = await transactionStatus(tempId);
    if (res.transactionId && isOnChainTxHash(res.transactionId)) {
      return { state: "confirmed", txHash: res.transactionId };
    }
    const status = res.status?.toLowerCase();
    if (status === "rejected") return { state: "rejected", txHash: null };
    if (status === "failed") return { state: "failed", txHash: null };
  }
  return { state: "timed_out", txHash: null };
}

export function PassMeetProvider({ children }: PassMeetProviderProps) {
  const { address, signMessage, executeTransaction, transactionStatus, requestRecords, wallet } = useWallet();
  const walletName = (wallet as { adapter?: { name?: string }; name?: string })?.adapter?.name ?? (wallet as { name?: string })?.name ?? "";
  const [events, setEvents] = useState<Event[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pendingOptimisticTicketRef = useRef<{ address: string; ticket: Ticket } | null>(null);
  const refreshTicketsDebounceRef = useRef<{ lastCall: number; lastCount: number }>({ lastCall: 0, lastCount: 0 });
  const REFRESH_TICKETS_DEBOUNCE_MS = 500;

  // ---- Authentication ----
  const authenticateWithSignature = useCallback(async (): Promise<boolean> => {
    if (!address) return false;

    LOG("authenticateWithSignature: starting");
    try {
      if (!signMessage) {
        setIsAuthenticated(false);
        throw new Error("Wallet does not support message signing. Use Shield, Leo, Puzzle, or Fox wallet.");
      }

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) {
        const err = (await nonceRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || "Failed to request authentication nonce.");
      }
      const nonceData = (await nonceRes.json()) as { message?: unknown };
      const message = typeof nonceData?.message === "string" ? nonceData.message : null;
      if (!message) throw new Error("Invalid nonce response.");

      const signatureBytes = await signMessage(message);
      if (!signatureBytes) {
        LOG("authenticateWithSignature: rejected or failed");
        setIsAuthenticated(false);
        return false;
      }

      const signatureBase64 = bytesToBase64(signatureBytes);
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signatureBase64 }),
      });
      if (!verifyRes.ok) {
        const err = (await verifyRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || "Signature verification failed.");
      }

      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionRes.json().catch(() => null)) as { authenticated?: boolean; address?: string } | null;
      const ok = !!session?.authenticated && session?.address === address;
      setIsAuthenticated(ok);
      if (!ok) throw new Error("Session not established.");

      LOG("authenticateWithSignature: success (server-verified)");
      return true;
    } catch (error) {
      LOG("authenticateWithSignature: error", error);
      console.error("Authentication failed:", error);
      setIsAuthenticated(false);
      return false;
    }
  }, [address, signMessage]);

  // ---- Refresh Events (on-chain + metadata) ----
  const refreshEvents = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    LOG("refreshEvents: starting...", { silent });
    if (!silent) setIsDataLoading(true);
    try {
      // 1) Get the number of events on-chain
      const maxEventId = await getEventCounter();
      LOG("refreshEvents: eventCounter", { maxEventId });
      if (maxEventId === 0) {
        setEvents([]);
        return;
      }

      // 2) Fetch on-chain event data for all IDs (parallel)
      const ids = Array.from({ length: maxEventId }, (_, i) => i + 1);
      const results = await Promise.all(ids.map((id) => getEvent(id).then((data) => ({ id, data }))));
      const onChainEvents = results.filter((r): r is { id: number; data: NonNullable<typeof r.data> } => r.data != null);

      // 3) Fetch metadata from IPFS (single batch call) + localStorage
      const ipfsMeta = await fetchAllEventMetadata();
      const localMeta = getLocalMetadata();

      // 4) Merge on-chain data with metadata
      // Show all on-chain events; use placeholder metadata when storage unavailable
      const merged = onChainEvents
        .map(({ id, data }): Event | null => {
          const idStr = String(id);
          const ipfs = ipfsMeta[idStr];
          const local = localMeta[idStr];

          // Priority: IPFS > localStorage > placeholder (never hide on-chain events)
          const name = ipfs?.name || local?.name || `Event #${id}`;
          const date = ipfs?.date || local?.date || "";
          const location = ipfs?.location || local?.location || "";
          const image = ipfs?.image || DEFAULT_IMAGE;

          const organizerShort = data.organizer
            ? `${data.organizer.slice(0, 10)}...${data.organizer.slice(-4)}`
            : "Unknown";

          const priceCredits = (data as { price_credits?: number }).price_credits ?? data.price;
          const priceUsdcx = (data as { price_usdcx?: number }).price_usdcx ?? 0;
          const priceUsad = (data as { price_usad?: number }).price_usad ?? 0;
          const rails: PaymentRail[] = [];
          if (priceCredits > 0) rails.push("credits");
          if (priceUsdcx > 0) rails.push("usdcx");
          if (priceUsad > 0) rails.push("usad");

          return {
            id: idStr,
            name,
            organizer: ipfs?.organizer || organizerShort,
            organizerAddress: data.organizer,
            capacity: data.capacity,
            ticketCount: data.ticket_count,
            price: priceCredits / 1_000_000,
            priceCredits,
            priceUsdcx,
            priceUsad,
            supportedRails: rails,
            date,
            location,
            image,
            status: "Active" as const,
          };
        })
        .filter((e): e is Event => e != null);

      LOG("refreshEvents: done", { count: merged.length, eventIds: merged.map((e) => e.id) });
      setEvents(merged);
    } catch (error) {
      const err = error as Error;
      LOG("refreshEvents: error", { message: err?.message, stack: err?.stack });
      console.error("[PassMeet] refreshEvents: error", err?.message, err?.stack ?? error);
      setEvents([]);
    } finally {
      if (!silent) setIsDataLoading(false);
    }
  }, []);

  // ---- Refresh Tickets (from wallet records) ----
  const refreshTickets = useCallback(async (opts?: { silent?: boolean }): Promise<number> => {
    if (!address || !requestRecords) return 0;

    const silent = opts?.silent ?? false;
    const now = Date.now();
    if (silent && now - refreshTicketsDebounceRef.current.lastCall < REFRESH_TICKETS_DEBOUNCE_MS) {
      return refreshTicketsDebounceRef.current.lastCount;
    }
    refreshTicketsDebounceRef.current.lastCall = now;
    LOG("refreshTickets: starting...", { address: address.slice(0, 12) + "...", silent });
    if (!silent) setIsDataLoading(true);
    try {
      let records: unknown[] | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
            LOG("refreshTickets: retry", { attempt: attempt + 1 });
          }
          records = await requestRecords(PASSMEET_V1_PROGRAM_ID, true);
          if (records && records.length > 0) break;
        } catch (e) {
          const msg = (e as Error)?.message ?? "";
          LOG("refreshTickets: requestRecords failed", { attempt: attempt + 1, message: msg });
          if (attempt === 2) {
            const lower = msg.toLowerCase();
            if (lower.includes("not_granted") || lower.includes("not granted")) {
              throw new Error(
                "Record access was denied. Please disconnect your wallet and reconnect - when reconnecting, approve the permission to access records for this app."
              );
            }
            throw e;
          }
        }
      }
      records = records ?? [];
      LOG("refreshTickets: records fetched", { count: records.length });
      const tickets: Ticket[] = [];

      if (records.length > 0) {
        // Fetch current events for name/date/location lookup
        const maxEventId = await getEventCounter();
        const eventMap: Record<string, Event> = {};

        const [ipfsMeta, ...eventResults] = await Promise.all([
          fetchAllEventMetadata(),
          ...Array.from({ length: maxEventId }, (_, i) => getEvent(i + 1)),
        ]);
        const localMeta = getLocalMetadata();

        for (let i = 0; i < eventResults.length; i++) {
          const data = eventResults[i];
          if (!data) continue;
          const id = i + 1;
          const idStr = String(id);
          const ipfs = ipfsMeta[idStr];
          const local = localMeta[idStr];
          const priceCredits = (data as { price_credits?: number }).price_credits ?? data.price;
          const priceUsdcx = (data as { price_usdcx?: number }).price_usdcx ?? 0;
          const priceUsad = (data as { price_usad?: number }).price_usad ?? 0;
          const rails: PaymentRail[] = [];
          if (priceCredits > 0) rails.push("credits");
          if (priceUsdcx > 0) rails.push("usdcx");
          if (priceUsad > 0) rails.push("usad");
          eventMap[idStr] = {
            id: idStr,
            name: ipfs?.name || local?.name || `Event #${id}`,
            organizer: "",
            organizerAddress: data.organizer,
            capacity: data.capacity,
            ticketCount: data.ticket_count,
            price: priceCredits / 1_000_000,
            priceCredits,
            priceUsdcx,
            priceUsad,
            supportedRails: rails,
            date: ipfs?.date || local?.date || "",
            location: ipfs?.location || local?.location || "",
            image: DEFAULT_IMAGE,
            status: "Active",
          };
        }

        function extractU64(val: unknown): string | null {
          if (val == null) return null;
          if (typeof val === "bigint") return String(val);
          const s = String(val);
          const m = s.match(/(\d+)u64/);
          return m ? m[1] : s.replace(/u64|\.private/g, "").trim() || null;
        }

        function parseRecordForIds(recordItem: unknown): { eventId: string; ticketId: string } | null {
          try {
            const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
            const data = record?.data ?? record?.plaintext ?? record ?? recordItem;
            const rawEventId = data?.event_id?.value ?? data?.event_id ?? data?.eventId ?? record?.event_id ?? record?.eventId;
            const rawTicketId = data?.ticket_id?.value ?? data?.ticket_id ?? data?.ticketId ?? record?.ticket_id ?? record?.ticketId;
            const eventIdRaw = extractU64(rawEventId) ?? (rawEventId != null ? String(rawEventId).replace(/u64|\.private/g, "").trim() : null);
            const ticketIdRaw = extractU64(rawTicketId) ?? (rawTicketId != null ? String(rawTicketId).replace(/u64|\.private/g, "").trim() : null);
            if (eventIdRaw && ticketIdRaw) return { eventId: eventIdRaw, ticketId: ticketIdRaw };
            const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
            const eventMatch = str.match(/event_id["\s:]+(\d+)u64/);
            const ticketMatch = str.match(/ticket_id["\s:]+(\d+)u64/);
            if (eventMatch && ticketMatch) return { eventId: eventMatch[1], ticketId: ticketMatch[1] };
            return null;
          } catch {
            return null;
          }
        }

        for (const recordItem of records) {
          try {
            const parsed = parseRecordForIds(recordItem);
            if (!parsed) continue;
            const { eventId: eventIdRaw, ticketId: ticketIdRaw } = parsed;

            const event = eventMap[eventIdRaw];

            tickets.push({
              id: `ticket_${eventIdRaw}_${ticketIdRaw}`,
              eventId: eventIdRaw,
              ticketId: ticketIdRaw,
              eventName: event?.name ?? `Event #${eventIdRaw}`,
              date: event?.date ?? "",
              location: event?.location ?? "",
              status: "Valid",
              txHash: "",
              nullifier: "",
              recordString: typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem)
            });
          } catch {
            continue;
          }
        }
      }

      setMyTickets((prev) => {
        const walletKeys = new Set(tickets.map((t) => `${t.eventId}_${t.ticketId}`));
        // When wallet returns empty (e.g. not synced after refresh), keep prev from localStorage
        const optimisticOnly =
          tickets.length === 0
            ? prev
            : prev.filter(
                (t) => !t.recordString && !walletKeys.has(`${t.eventId}_${t.ticketId}`)
              );
        let fromRef: Ticket[] = [];
        const pending = pendingOptimisticTicketRef.current;
        if (pending && pending.address === address) {
          const key = `${pending.ticket.eventId}_${pending.ticket.ticketId}`;
          if (walletKeys.has(key)) {
            pendingOptimisticTicketRef.current = null;
          } else {
            fromRef = [pending.ticket];
          }
        }
        const merged =
          tickets.length === 0 ? optimisticOnly : [...tickets, ...fromRef, ...optimisticOnly];
        LOG("refreshTickets: done", { fromWallet: tickets.length, fromRef: fromRef.length, optimistic: optimisticOnly.length, total: merged.length });
        return merged;
      });
      refreshTicketsDebounceRef.current.lastCount = tickets.length;
      return tickets.length;
    } catch (error) {
      const err = error as Error;
      LOG("refreshTickets: error", { message: err?.message, stack: err?.stack });
      console.error("[PassMeet] refreshTickets: error", err?.message, err?.stack ?? error);
      return 0;
    } finally {
      if (!silent) setIsDataLoading(false);
    }
  }, [address, requestRecords]);

  // ---- Create Event ----
  const createEvent = useCallback(async (
    name: string,
    capacity: number,
    priceCredits: number,
    priceUsdcx: number,
    priceUsad: number,
    eventDate: string,
    eventLocation: string
  ): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("createEvent: starting", { name, capacity, priceCredits, priceUsdcx, priceUsad, eventDate, eventLocation });
    try {
      const prevCount = await getEventCounter();
      LOG("createEvent: prevEventCount", prevCount);
      const creditsMicro = Math.floor(priceCredits * 1_000_000);
      const usdcxMicro = Math.floor(priceUsdcx * 1_000_000);
      const usadMicro = Math.floor(priceUsad * 1_000_000);
      const result = await executeTransaction({
        program: PASSMEET_V1_PROGRAM_ID,
        function: "create_event",
        inputs: [`${capacity}u32`, `${creditsMicro}u128`, `${usdcxMicro}u128`, `${usadMicro}u128`],
        fee: 100_000,
      });

      const tempId = result?.transactionId;
      LOG("createEvent: tx submitted", { tempId });
      if (tempId) {
        const { state, txHash } = await pollForTxHash(tempId, transactionStatus);
        if (state !== "confirmed") {
          throw new Error(
            state === "rejected" ? "Transaction was rejected." :
            state === "failed" ? "Transaction failed on-chain." :
            "Transaction confirmation timed out. Check your wallet for status."
          );
        }
        LOG("createEvent: tx confirmed", { tempId, txHash });
        // Try to discover the new on-chain event ID by polling
        let newOnChainId: number;
        try {
          newOnChainId = await pollForNewEventId(prevCount);
        } catch {
          newOnChainId = prevCount + 1;
        }

        const idStr = String(newOnChainId);

        saveLocalMetadata(idStr, { name, date: eventDate, location: eventLocation });

        const metaRes = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: newOnChainId,
            name,
            date: eventDate,
            location: eventLocation,
            organizer: address,
            capacity,
            price: creditsMicro / 1_000_000,
            priceCredits: creditsMicro,
            priceUsdcx,
            priceUsad
          })
        });
        if (!metaRes.ok) {
          const errBody = await metaRes.text();
          throw new Error(`Metadata save failed: ${errBody || metaRes.statusText}`);
        }

        const rails: PaymentRail[] = [];
        if (creditsMicro > 0) rails.push("credits");
        if (usdcxMicro > 0) rails.push("usdcx");
        if (usadMicro > 0) rails.push("usad");

        const newEvent: Event = {
          id: idStr,
          name,
          organizer: address.slice(0, 10) + "..." + address.slice(-4),
          organizerAddress: address,
          capacity,
          ticketCount: 0,
          price: creditsMicro / 1_000_000,
          priceCredits: creditsMicro,
          priceUsdcx: usdcxMicro,
          priceUsad: usadMicro,
          supportedRails: rails,
          date: eventDate,
          location: eventLocation,
          image: DEFAULT_IMAGE,
          status: "Active"
        };

        setEvents((prev) => [...prev, newEvent]);
        LOG("createEvent: success", { eventId: idStr, onChainTxHash: txHash });
        return txHash;
      }
      LOG("createEvent: no tempId from wallet");
      return null;
    } catch (error) {
      LOG("createEvent: error", error);
      console.error("Failed to create event:", error);
      throw new Error(mapWalletError(error));
    }
  }, [address, executeTransaction, transactionStatus]);

  // ---- Buy Ticket ----
  const buyTicket = useCallback(async (event: Event, rail: PaymentRail = "credits"): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("buyTicket: starting", { eventId: event.id, eventName: event.name, rail });
    try {
      const eventIdNum = parseInt(event.id, 10);
      if (isNaN(eventIdNum)) {
        throw new Error(`Invalid event ID: "${event.id}". Expected a numeric on-chain ID.`);
      }

      const onChainEvent = await getEvent(eventIdNum);
      if (!onChainEvent) {
        throw new Error(`Event #${eventIdNum} not found on-chain. It may not have been confirmed yet.`);
      }

      if (onChainEvent.ticket_count >= onChainEvent.capacity) {
        throw new Error("This event is sold out.");
      }

      const nextTicketId = onChainEvent.ticket_count + 1;
      const isFree = event.priceCredits === 0 && event.priceUsdcx === 0 && event.priceUsad === 0;

      if (rail === "usdcx" || rail === "usad") {
        throw new Error("USDCx and USAD payment rails are not yet available. Use Aleo credits.");
      }

      const FEE_MINT = 100_000;
      const FEE_TRANSFER = 100_000;

      // Paid event (credits): transfer credits to organizer first, then mint
      if (!isFree && rail === "credits" && requestRecords && event.organizerAddress) {
        const priceMicro = event.priceCredits;
        const requiredCredits = priceMicro + FEE_TRANSFER + FEE_MINT;
        let creditsRecords: unknown[] = [];
        try {
          creditsRecords = (await requestRecords(CREDITS_PROGRAM_ID, true)) ?? [];
        } catch (e) {
          LOG("buyTicket: requestRecords(credits) failed", (e as Error)?.message);
          throw new Error("Could not read your Aleo credits. Approve record access for credits.aleo and try again.");
        }
        const recordItem = creditsRecords.find((r) => (getMicrocreditsFromCreditsRecord(r) ?? 0) >= requiredCredits);
        if (!recordItem) {
          throw new Error(
            `Insufficient private balance. You need at least ${(requiredCredits / 1_000_000).toFixed(2)} Aleo in a single credits record to pay for this ticket (${event.price} Aleo + fees).`
          );
        }
        let creditRecordInput: string;
        if (typeof recordItem === "string") {
          creditRecordInput = recordItem;
        } else {
          const r = recordItem as Record<string, unknown>;
          const str =
            (typeof r?.plaintext === "string" ? r.plaintext : null) ??
            (typeof r?.ciphertext === "string" ? r.ciphertext : null) ??
            (typeof r?.record === "string" ? r.record : null);
          if (typeof str === "string" && str.length > 10) {
            creditRecordInput = str;
          } else {
            creditRecordInput = JSON.stringify(recordItem);
          }
        }
        LOG("buyTicket: executing payment to organizer", { organizer: event.organizerAddress.slice(0, 12) + "...", priceMicro });
        const payTxResult = (await executeTransaction({
          program: CREDITS_PROGRAM_ID,
          function: "transfer_private",
          inputs: [creditRecordInput, event.organizerAddress, `${priceMicro}u64`],
          fee: FEE_TRANSFER,
        })) ?? null;
        const payTempId = payTxResult?.transactionId ?? null;
        if (!payTempId) {
          throw new Error("Payment transaction was not submitted. Please try again.");
        }
        const payPollResult = await pollForTxHash(payTempId, transactionStatus);
        if (payPollResult.state !== "confirmed") {
          throw new Error(
            payPollResult.state === "rejected" ? "Payment was rejected." :
            payPollResult.state === "failed" ? "Payment failed on-chain." :
            "Payment confirmation timed out. Your balance may have been deducted; check your wallet. You can retry minting."
          );
        }
        LOG("buyTicket: payment confirmed", { payTxHash: payPollResult.txHash });
      }

      const mintFunction = isFree ? "mint_free_ticket" : "mint_ticket";
      LOG("buyTicket: minting", { eventIdNum, nextTicketId, mintFunction });

      const txPayload = {
        program: PASSMEET_V1_PROGRAM_ID,
        function: mintFunction,
        inputs: [`${eventIdNum}u64`, `${nextTicketId}u64`],
        fee: FEE_MINT,
      };
      let result: { transactionId?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        result = (await executeTransaction(txPayload)) ?? null;
        if (result?.transactionId) break;
        LOG("buyTicket: no transactionId from wallet (Shield/Leo edge case), retry", { attempt: attempt + 1 });
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }

      const tempId = result?.transactionId ?? null;
      LOG("buyTicket: tx submitted", { tempId, walletName: walletName || "unknown" });
      if (tempId) {
        const mintResult = await pollForTxHash(tempId, transactionStatus);
        if (mintResult.state !== "confirmed") {
          throw new Error(
            mintResult.state === "rejected" ? "Mint was rejected." :
            mintResult.state === "failed" ? "Mint failed on-chain." :
            "Mint confirmation timed out. Check your wallet for status."
          );
        }
        const txHash = mintResult.txHash;
        LOG("buyTicket: tx confirmed", { tempId, txHash });

        const optimisticTicket: Ticket = {
          id: `ticket_${eventIdNum}_${nextTicketId}`,
          eventId: String(eventIdNum),
          ticketId: String(nextTicketId),
          eventName: event.name,
          date: event.date,
          location: event.location,
          status: "Valid",
          txHash: txHash ?? "", // txHash is non-null when state is confirmed
          nullifier: "",
          recordString: undefined,
        };
        setMyTickets((prev) => {
          const exists = prev.some((t) => t.eventId === optimisticTicket.eventId && t.ticketId === optimisticTicket.ticketId);
          return exists ? prev : [...prev, optimisticTicket];
        });
        pendingOptimisticTicketRef.current = address ? { address, ticket: optimisticTicket } : null;
        LOG("buyTicket: optimistic ticket added", { eventId: eventIdNum, ticketId: nextTicketId });

        await refreshEvents({ silent: true });
        await new Promise((r) => setTimeout(r, 100));
        for (let attempt = 0; attempt < 6; attempt++) {
          const count = await refreshTickets({ silent: true });
          LOG("buyTicket: refreshTickets attempt", { attempt, count });
          console.log("[PassMeet] buyTicket: refreshTickets attempt", { attempt, count });
          if (count > 0) break;
          if (attempt < 5) await new Promise((r) => setTimeout(r, 4000));
        }
        LOG("buyTicket: success", { onChainTxHash: txHash });
        return txHash;
      }
      LOG("buyTicket: no txId returned");
      return null;
    } catch (error) {
      LOG("buyTicket: error", error);
      console.error("Failed to buy ticket:", error);
      throw new Error(mapWalletError(error));
    }
  }, [address, executeTransaction, transactionStatus, requestRecords, refreshTickets, refreshEvents, walletName]);

  // ---- Verify Entry ----
  const verifyEntry = useCallback(async (ticket: Ticket): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("verifyEntry: starting", { ticketId: ticket.id, eventId: ticket.eventId, hasRecordString: !!ticket.recordString });
    try {
      function extractU64Verify(val: unknown): string | null {
        if (val == null) return null;
        if (typeof val === "bigint") return String(val);
        const s = String(val);
        const m = s.match(/(\d+)u64/);
        return m ? m[1] : s.replace(/u64|\.private/g, "").trim() || null;
      }

      function parseRecordIds(recordItem: unknown): { eventId: string; ticketId: string } | null {
        try {
          const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
          const data = record?.data ?? record?.plaintext ?? record ?? recordItem;
          const rawEventId = data?.event_id?.value ?? data?.event_id ?? record?.event_id ?? record?.eventId;
          const rawTicketId = data?.ticket_id?.value ?? data?.ticket_id ?? record?.ticket_id ?? record?.ticketId;
          const eventId = extractU64Verify(rawEventId) ?? (rawEventId != null ? String(rawEventId).replace(/u64|\.private/g, "").trim() : null);
          const ticketId = extractU64Verify(rawTicketId) ?? (rawTicketId != null ? String(rawTicketId).replace(/u64|\.private/g, "").trim() : null);
          if (eventId && ticketId) return { eventId, ticketId };
          const str = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
          const eventMatch = str.match(/event_id["\s:]+(\d+)u64/);
          const ticketMatch = str.match(/ticket_id["\s:]+(\d+)u64/);
          if (eventMatch && ticketMatch) return { eventId: eventMatch[1], ticketId: ticketMatch[1] };
          return null;
        } catch {
          return null;
        }
      }

      const targetEventId = ticket.eventId;
      const targetTicketId = ticket.ticketId;
      let recordToUse: unknown = null;

      // Always fetch fresh records from wallet - cached recordString can have wrong format for executeTransaction
      // (wallet expects native Aleo record format, not JSON; localStorage can corrupt the format)
      if (!requestRecords) {
        throw new Error("Wallet does not support record requests. Please use Leo or Puzzle wallet.");
      }
      {
        let records: unknown[] | null = null;
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
              LOG("verifyEntry: retry requestRecords", { attempt: attempt + 1 });
            }
            records = await requestRecords(PASSMEET_V1_PROGRAM_ID, true);
            LOG("verifyEntry: records fetched", { attempt: attempt + 1, count: records?.length ?? 0 });
            if (records && records.length > 0) break;
          } catch (reqErr) {
            const msg = (reqErr as Error)?.message ?? "";
            LOG("verifyEntry: requestRecords failed", { attempt: attempt + 1, message: msg });
            if (attempt === maxAttempts - 1) {
              const lower = msg.toLowerCase();
              if (lower.includes("not_granted") || lower.includes("not granted")) {
                throw new Error(
                  "Record access was denied. Please disconnect your wallet and reconnect - when reconnecting, approve the permission to access records for this app."
                );
              }
              throw new Error(
                lower.includes("request") && lower.includes("record")
                  ? "Wallet could not provide records. Try: 1) Disconnect and reconnect your wallet, 2) Ensure Leo/Puzzle wallet is on Testnet, 3) Refresh tickets and try again."
                  : msg || "Failed to request records from wallet."
              );
            }
          }
        }

        if (!records || records.length === 0) {
          throw new Error(
            "Wallet has not synced your ticket yet. Please wait a minute, refresh your tickets, and try again."
          );
        }

        for (const recordItem of records) {
          const parsed = parseRecordIds(recordItem);
          if (parsed && parsed.eventId === targetEventId && parsed.ticketId === targetTicketId) {
            // Pass record as-is - wallet may accept object or string; avoid JSON.stringify (wrong format)
            recordToUse = typeof recordItem === "string" ? recordItem : recordItem;
            break;
          }
        }

        if (!recordToUse) {
          throw new Error(
            "Could not find matching ticket record in your wallet. Try refreshing your tickets first."
          );
        }
      }

      if (recordToUse == null) {
        throw new Error(
          "No ticket record available. Please refresh your tickets and ensure your wallet has synced."
        );
      }

      // Pass record - Leo wallet expects Aleo record format (plaintext string or ciphertext)
      let recordInput: string;
      if (typeof recordToUse === "string") {
        recordInput = recordToUse;
      } else {
        const r = recordToUse as Record<string, unknown>;
        // Prefer fields that may contain the exact format the wallet expects
        const str =
          (typeof r?.plaintext === "string" ? r.plaintext : null) ??
          (typeof r?.record === "string" ? r.record : null) ??
          (typeof r?.string === "string" ? r.string : null) ??
          (typeof (r as { toString?: () => string }).toString === "function"
            ? (r as { toString: () => string }).toString()
            : null);
        if (typeof str === "string" && str.length > 10) {
          recordInput = str;
        } else if (typeof r?.ciphertext === "string" && r.ciphertext.startsWith("record1")) {
          // Wallet may accept ciphertext - it decrypts internally for spending
          recordInput = r.ciphertext as string;
        } else {
          // Build Aleo plaintext format: owner.private, event_id, ticket_id, _nonce, version
          const data = (r?.data ?? r?.plaintext ?? r) as Record<string, unknown>;
          const getVal = (k: string) => {
            const v = data?.[k] ?? (r as Record<string, unknown>)?.[k];
            return (v as { value?: unknown })?.value ?? v;
          };
          let owner = getVal("owner");
          const eventId = getVal("event_id") ?? data?.event_id;
          const ticketId = getVal("ticket_id") ?? data?.ticket_id;
          const nonce = getVal("_nonce") ?? (r as Record<string, unknown>)?._nonce;
          const version = getVal("version") ?? getVal("_version") ?? "1u8.public";
          if (typeof owner === "string" && !owner.endsWith(".private") && !owner.endsWith(".public")) {
            owner = `${owner}.private`;
          }
          const fmt = (v: unknown) =>
            typeof v === "string" ? v : v != null ? String(v) : "";
          recordInput = `{\nowner: ${fmt(owner)},\nevent_id: ${fmt(eventId)},\nticket_id: ${fmt(ticketId)},\n_nonce: ${fmt(nonce)},\nversion: ${fmt(version)}\n}`;
        }
      }
      const result = await executeTransaction({
        program: PASSMEET_V1_PROGRAM_ID,
        function: "verify_entry",
        inputs: [recordInput],
        fee: 100_000,
      });

      const tempId = result?.transactionId;
      LOG("verifyEntry: tx submitted", { tempId });
      if (tempId) {
        const verifyResult = await pollForTxHash(tempId, transactionStatus);
        if (verifyResult.state !== "confirmed") {
          throw new Error(
            verifyResult.state === "rejected" ? "Verification was rejected." :
            verifyResult.state === "failed" ? "Verification failed on-chain." :
            "Verification confirmation timed out."
          );
        }
        const txHash = verifyResult.txHash;
        LOG("verifyEntry: tx confirmed", { tempId, txHash });
        setMyTickets((prev) =>
          prev.map((t) =>
            t.id === ticket.id ? { ...t, status: "Used" as const } : t
          )
        );
        LOG("verifyEntry: success", { onChainTxHash: txHash });
        return txHash;
      }
      LOG("verifyEntry: no txId returned");
      return null;
    } catch (error) {
      LOG("verifyEntry: error", error);
      console.error("Failed to verify entry:", error);
      throw new Error(mapWalletError(error));
    }
  }, [address, executeTransaction, transactionStatus, requestRecords]);

  // ---- Helpers ----
  async function pollForNewEventId(prevCount: number, maxAttempts = 15): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const count = await getEventCounter();
      if (count > prevCount) return count;
    }
    throw new Error("Timed out waiting for on-chain event confirmation");
  }

  // ---- Persist tickets to localStorage (per-address) ----
  useEffect(() => {
    if (address && myTickets.length > 0) {
      saveTicketsToLocalStorage(address, myTickets);
    }
  }, [address, myTickets]);

  // ---- Mount / wallet change ----
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!address) {
        setIsAuthenticated(false);
        setMyTickets([]);
        // Best-effort: clear server session when wallet disconnects.
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        return;
      }

      const saved = getTicketsFromLocalStorage(address);
      setMyTickets(saved);
      pendingOptimisticTicketRef.current = null;
      LOG("wallet connected: refreshing data", { address: address.slice(0, 12) + "...", savedTickets: saved.length });

      // Restore auth from HttpOnly session cookie (server-verified). Never trust localStorage.
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        const session = (await sessionRes.json().catch(() => null)) as { authenticated?: boolean; address?: string } | null;
        const ok = !!session?.authenticated && session?.address === address;
        if (!cancelled) setIsAuthenticated(ok);
        if (session?.authenticated && session?.address && session.address !== address) {
          fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }

      const doRefresh = async () => {
        await refreshEvents();
        let count = await refreshTickets();
        for (let retry = 0; retry < 2 && count === 0; retry++) {
          await new Promise((r) => setTimeout(r, 3000));
          count = await refreshTickets({ silent: true });
        }
      };
      doRefresh().catch((err) => {
        LOG("initial refresh error", { message: (err as Error)?.message, stack: (err as Error)?.stack });
        console.error("[PassMeet] initial refresh error", err);
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [address, refreshEvents, refreshTickets]);

    return (
    <PassMeetContext.Provider
      value={{
        events,
        myTickets,
        isLoading: isDataLoading,
        isDataLoading,
        isAuthenticated,
        authenticateWithSignature,
        createEvent,
        buyTicket,
        verifyEntry,
        refreshEvents,
        refreshTickets
      }}
    >
      {children}
    </PassMeetContext.Provider>
  );
}

export { PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID };
