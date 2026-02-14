"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useWallet } from "@provablehq/aleo-wallet-adaptor-react";
import { PASSMEET_V1_PROGRAM_ID, PASSMEET_SUBS_PROGRAM_ID } from "@/lib/aleo";
import { getEventCounter, getEvent } from "@/lib/aleo-rpc";

export interface Event {
  id: string;
  name: string;
  organizer: string;
  organizerAddress: string;
  capacity: number;
  ticketCount: number;
  price: number;
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
  createEvent: (name: string, capacity: number, price: number, eventDate: string, eventLocation: string) => Promise<string | null>;
  buyTicket: (event: Event) => Promise<string | null>;
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
const LOG = (msg: string, data?: unknown) => {
  console.log(`[PassMeet] ${msg}`, data ?? "");
};

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

/** Poll for final ON-CHAIN transaction ID (at1...). Never returns temp UUID - only valid explorer IDs. */
async function pollForTxHash(
  tempId: string,
  transactionStatus: (id: string) => Promise<{ status: string; transactionId?: string; error?: string }>,
  maxAttempts = 45
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await transactionStatus(tempId);
    // Only return if we have the real on-chain hash (at1...), not temp UUID
    if (res.transactionId && isOnChainTxHash(res.transactionId)) {
      return res.transactionId;
    }
    const status = res.status?.toLowerCase();
    if (status === "rejected" || status === "failed") {
      return null;
    }
  }
  return null;
}

export function PassMeetProvider({ children }: PassMeetProviderProps) {
  const { address, signMessage, executeTransaction, transactionStatus, requestRecords } = useWallet();
  const [events, setEvents] = useState<Event[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pendingOptimisticTicketRef = useRef<{ address: string; ticket: Ticket } | null>(null);

  // ---- Authentication ----
  const authenticateWithSignature = useCallback(async (): Promise<boolean> => {
    if (!address) return false;

    LOG("authenticateWithSignature: starting");
    try {
      if (signMessage) {
        const message = `PassMeet Authentication\nTimestamp: ${Date.now()}\nAddress: ${address}`;
        const signature = await signMessage(message);

        if (signature) {
          LOG("authenticateWithSignature: success (signed)");
          setIsAuthenticated(true);
          localStorage.setItem("passmeet_auth", JSON.stringify({
            address,
            timestamp: Date.now()
          }));
          return true;
        }
        return false;
      } else {
        LOG("authenticateWithSignature: success (connect-only)");
        setIsAuthenticated(true);
        localStorage.setItem("passmeet_auth", JSON.stringify({
          address,
          timestamp: Date.now(),
          method: "wallet-connect"
        }));
        return true;
      }
    } catch (error) {
      LOG("authenticateWithSignature: error, using fallback", error);
      console.error("Authentication failed:", error);
      setIsAuthenticated(true);
      localStorage.setItem("passmeet_auth", JSON.stringify({
        address,
        timestamp: Date.now(),
        method: "fallback"
      }));
      return true;
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
      // Only show events that have metadata (IPFS or localStorage) to avoid orphan/test data
      const merged = onChainEvents
        .map(({ id, data }): Event | null => {
          const idStr = String(id);
          const ipfs = ipfsMeta[idStr];
          const local = localMeta[idStr];

          // Skip events with no metadata (avoids showing placeholder "Event #1" from orphan on-chain data)
          if (!ipfs && !local) return null;

          // Priority: IPFS > localStorage > defaults
          const name = ipfs?.name || local?.name || `Event #${id}`;
          const date = ipfs?.date || local?.date || "";
          const location = ipfs?.location || local?.location || "";
          const image = ipfs?.image || DEFAULT_IMAGE;

          const organizerShort = data.organizer
            ? `${data.organizer.slice(0, 10)}...${data.organizer.slice(-4)}`
            : "Unknown";

          return {
            id: idStr,
            name,
            organizer: ipfs?.organizer || organizerShort,
            organizerAddress: data.organizer,
            capacity: data.capacity,
            ticketCount: data.ticket_count,
            price: data.price / 1_000_000,
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
          LOG("refreshTickets: requestRecords failed", { attempt: attempt + 1, message: (e as Error)?.message });
          if (attempt === 2) throw e;
        }
      }
      records = records ?? [];
      LOG("refreshTickets: records fetched", { count: records.length });
      console.log("[PassMeet] refreshTickets: records count", records.length);
      if (records.length > 0) {
        LOG("refreshTickets: raw record sample", JSON.stringify(records[0]).slice(0, 500));
      }
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
          eventMap[idStr] = {
            id: idStr,
            name: ipfs?.name || local?.name || `Event #${id}`,
            organizer: "",
            organizerAddress: data.organizer,
            capacity: data.capacity,
            ticketCount: data.ticket_count,
            price: data.price / 1_000_000,
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
            let eventIdRaw = extractU64(rawEventId) ?? (rawEventId != null ? String(rawEventId).replace(/u64|\.private/g, "").trim() : null);
            let ticketIdRaw = extractU64(rawTicketId) ?? (rawTicketId != null ? String(rawTicketId).replace(/u64|\.private/g, "").trim() : null);
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
        console.log("[PassMeet] refreshTickets: merge result", { fromWallet: tickets.length, fromRef: fromRef.length, optimistic: optimisticOnly.length, total: merged.length });
        return merged;
      });
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
    price: number,
    eventDate: string,
    eventLocation: string
  ): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("createEvent: starting", { name, capacity, price, eventDate, eventLocation });
    try {
      const prevCount = await getEventCounter();
      LOG("createEvent: prevEventCount", prevCount);
      const result = await executeTransaction({
        program: PASSMEET_V1_PROGRAM_ID,
        function: "create_event",
        inputs: [`${capacity}u32`, `${Math.floor(price * 1_000_000)}u64`],
        fee: 100_000,
      });

      const tempId = result?.transactionId;
      LOG("createEvent: tx submitted", { tempId });
      if (tempId) {
        const txHash = await pollForTxHash(tempId, transactionStatus);
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

        try {
          await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: newOnChainId,
              name,
              date: eventDate,
              location: eventLocation,
              organizer: address,
              capacity,
              price
            })
          });
        } catch {
          // IPFS optional
        }

        const newEvent: Event = {
          id: idStr,
          name,
          organizer: address.slice(0, 10) + "..." + address.slice(-4),
          organizerAddress: address,
          capacity,
          ticketCount: 0,
          price,
          date: eventDate,
          location: eventLocation,
          image: DEFAULT_IMAGE,
          status: "Active"
        };

        setEvents((prev) => [...prev, newEvent]);
        // Return on-chain hash (at1...) for explorer; "PENDING" when created but hash not yet available
        LOG("createEvent: success", { eventId: idStr, onChainTxHash: txHash ?? "pending" });
        return txHash ?? "PENDING";
      }
      LOG("createEvent: no tempId from wallet");
      return null;
    } catch (error) {
      LOG("createEvent: error", error);
      console.error("Failed to create event:", error);
      throw error;
    }
  }, [address, executeTransaction, transactionStatus]);

  // ---- Buy Ticket ----
  const buyTicket = useCallback(async (event: Event): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("buyTicket: starting", { eventId: event.id, eventName: event.name });
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
      LOG("buyTicket: minting", { eventIdNum, nextTicketId });

      const result = await executeTransaction({
        program: PASSMEET_V1_PROGRAM_ID,
        function: "mint_ticket",
        inputs: [`${eventIdNum}u64`, `${nextTicketId}u64`],
        fee: 100_000,
      });

      const tempId = result?.transactionId;
      LOG("buyTicket: tx submitted", { tempId });
      if (tempId) {
        const txHash = await pollForTxHash(tempId, transactionStatus);
        LOG("buyTicket: tx confirmed", { tempId, txHash });

        const optimisticTicket: Ticket = {
          id: `ticket_${eventIdNum}_${nextTicketId}`,
          eventId: String(eventIdNum),
          ticketId: String(nextTicketId),
          eventName: event.name,
          date: event.date,
          location: event.location,
          status: "Valid",
          txHash: txHash ?? "",
          nullifier: "",
          recordString: undefined,
        };
        setMyTickets((prev) => {
          const exists = prev.some((t) => t.eventId === optimisticTicket.eventId && t.ticketId === optimisticTicket.ticketId);
          return exists ? prev : [...prev, optimisticTicket];
        });
        pendingOptimisticTicketRef.current = address ? { address, ticket: optimisticTicket } : null;
        LOG("buyTicket: optimistic ticket added", { eventId: eventIdNum, ticketId: nextTicketId });
        console.log("[PassMeet] buyTicket: optimistic ticket added", { eventId: eventIdNum, ticketId: nextTicketId });

        await refreshEvents({ silent: true });
        await new Promise((r) => setTimeout(r, 100));
        for (let attempt = 0; attempt < 6; attempt++) {
          const count = await refreshTickets({ silent: true });
          LOG("buyTicket: refreshTickets attempt", { attempt, count });
          console.log("[PassMeet] buyTicket: refreshTickets attempt", { attempt, count });
          if (count > 0) break;
          if (attempt < 5) await new Promise((r) => setTimeout(r, 4000));
        }
        LOG("buyTicket: success", { onChainTxHash: txHash ?? "pending" });
        return txHash ?? "PENDING";
      }
      LOG("buyTicket: no txId returned");
      return null;
    } catch (error) {
      LOG("buyTicket: error", error);
      console.error("Failed to buy ticket:", error);
      throw error;
    }
  }, [address, executeTransaction, transactionStatus, refreshTickets, refreshEvents]);

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
              throw new Error(
                msg.toLowerCase().includes("request") && msg.toLowerCase().includes("record")
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

      // Pass record - must be string in Aleo plaintext format for Leo wallet
      let recordInput: string;
      if (typeof recordToUse === "string") {
        recordInput = recordToUse;
      } else {
        const r = recordToUse as Record<string, unknown>;
        const str = r?.toString?.() ?? r?.string ?? r?.record;
        if (typeof str === "string") {
          recordInput = str;
        } else {
          // Build Aleo record format from object (wallet may return plain object via postMessage)
          const data = (r?.data ?? r?.plaintext ?? r) as Record<string, unknown>;
          const owner = data?.owner ?? r?.owner ?? "";
          const eventId = data?.event_id ?? r?.event_id ?? "";
          const ticketId = data?.ticket_id ?? r?.ticket_id ?? "";
          const nonce = data?._nonce ?? r?._nonce ?? "";
          const version = data?.version ?? r?.version ?? "1u8.public";
          const fmt = (v: unknown) => (typeof v === "string" ? v : v != null ? String(v) : "");
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
        const txHash = await pollForTxHash(tempId, transactionStatus);
        LOG("verifyEntry: tx confirmed", { tempId, txHash });
        setMyTickets((prev) =>
          prev.map((t) =>
            t.id === ticket.id ? { ...t, status: "Used" as const } : t
          )
        );
        LOG("verifyEntry: success", { onChainTxHash: txHash ?? "pending" });
        return txHash ?? "PENDING";
      }
      LOG("verifyEntry: no txId returned");
      return null;
    } catch (error) {
      LOG("verifyEntry: error", error);
      console.error("Failed to verify entry:", error);
      throw error;
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
      console.log("[PassMeet] tickets persisted", { address: address.slice(0, 12) + "...", count: myTickets.length });
    }
  }, [address, myTickets]);

  // ---- Mount / wallet change ----
  useEffect(() => {
    if (address) {
      const saved = getTicketsFromLocalStorage(address);
      setMyTickets(saved);
      pendingOptimisticTicketRef.current = null;
      LOG("wallet connected: refreshing data", { address: address.slice(0, 12) + "...", savedTickets: saved.length });
      console.log("[PassMeet] loaded tickets from storage", { count: saved.length });
      const stored = localStorage.getItem("passmeet_auth");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.address === address && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
            setIsAuthenticated(true);
          }
        } catch {
          // ignore
        }
      }
      const doRefresh = async () => {
        await refreshEvents();
        let count = await refreshTickets();
        for (let retry = 0; retry < 2 && count === 0; retry++) {
          await new Promise((r) => setTimeout(r, 3000));
          count = await refreshTickets({ silent: true });
          console.log("[PassMeet] refreshTickets retry", { retry: retry + 1, count });
        }
      };
      doRefresh().catch((err) => {
        LOG("initial refresh error", { message: (err as Error)?.message, stack: (err as Error)?.stack });
        console.error("[PassMeet] initial refresh error", err);
      });
    } else {
      setIsAuthenticated(false);
      setMyTickets([]);
    }
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
