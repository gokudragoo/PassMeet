"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
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
  isAuthenticated: boolean;
  authenticateWithSignature: () => Promise<boolean>;
  createEvent: (name: string, capacity: number, price: number, eventDate: string, eventLocation: string) => Promise<string | null>;
  buyTicket: (event: Event) => Promise<string | null>;
  verifyEntry: (ticket: Ticket) => Promise<string | null>;
  refreshEvents: () => Promise<void>;
  refreshTickets: () => Promise<void>;
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
    await new Promise((r) => setTimeout(r, 2000));
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const refreshEvents = useCallback(async () => {
    LOG("refreshEvents: starting...");
    setIsLoading(true);
    try {
      // 1) Get the number of events on-chain
      const maxEventId = await getEventCounter();
      LOG("refreshEvents: eventCounter", { maxEventId });
      if (maxEventId === 0) {
        setEvents([]);
        return;
      }

      // 2) Fetch on-chain event data for all IDs
      const onChainEvents: { id: number; data: NonNullable<Awaited<ReturnType<typeof getEvent>>> }[] = [];
      for (let id = 1; id <= maxEventId; id++) {
        const data = await getEvent(id);
        if (data) onChainEvents.push({ id, data });
      }

      // 3) Fetch metadata from IPFS (single batch call) + localStorage
      const ipfsMeta = await fetchAllEventMetadata();
      const localMeta = getLocalMetadata();

      // 4) Merge on-chain data with metadata
      // Only show events that have metadata (IPFS or localStorage) to avoid orphan/test data
      const merged: Event[] = onChainEvents
        .map(({ id, data }) => {
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
      LOG("refreshEvents: error", error);
      console.error("Failed to refresh events:", error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Refresh Tickets (from wallet records) ----
  const refreshTickets = useCallback(async () => {
    if (!address || !requestRecords) return;

    LOG("refreshTickets: starting...", { address: address.slice(0, 12) + "..." });
    setIsLoading(true);
    try {
      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID, true);
      LOG("refreshTickets: records fetched", { count: records?.length ?? 0 });
      const tickets: Ticket[] = [];

      if (records && records.length > 0) {
        // Fetch current events for name/date/location lookup
        const maxEventId = await getEventCounter();
        const eventMap: Record<string, Event> = {};

        const ipfsMeta = await fetchAllEventMetadata();
        const localMeta = getLocalMetadata();

        for (let id = 1; id <= maxEventId; id++) {
          const data = await getEvent(id);
          if (!data) continue;
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

        for (const recordItem of records) {
          try {
            const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
            const data = record?.data ?? record?.plaintext ?? record;
            const rawEventId = data?.event_id?.value ?? data?.event_id;
            const rawTicketId = data?.ticket_id?.value ?? data?.ticket_id;
            if (!rawEventId || !rawTicketId) continue;

            const eventIdRaw = String(rawEventId).replace("u64", "").replace(".private", "").trim();
            const ticketIdRaw = String(rawTicketId).replace("u64", "").replace(".private", "").trim();

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

      LOG("refreshTickets: done", { count: tickets.length });
      setMyTickets(tickets);
    } catch (error) {
      LOG("refreshTickets: error", error);
      console.error("Failed to refresh tickets:", error);
      setMyTickets([]);
    } finally {
      setIsLoading(false);
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
      setIsLoading(true);

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
        LOG("createEvent: success", { eventId: idStr, txHash: txHash ?? tempId });
        return txHash ?? tempId;
      }
      LOG("createEvent: no txId returned");
      return null;
    } catch (error) {
      LOG("createEvent: error", error);
      console.error("Failed to create event:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, executeTransaction, transactionStatus]);

  // ---- Buy Ticket ----
  const buyTicket = useCallback(async (event: Event): Promise<string | null> => {
    if (!address || !executeTransaction) return null;

    LOG("buyTicket: starting", { eventId: event.id, eventName: event.name });
    try {
      setIsLoading(true);

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
        await refreshEvents();
        await refreshTickets();
        LOG("buyTicket: success", { txHash: txHash ?? tempId });
        return txHash ?? tempId;
      }
      LOG("buyTicket: no txId returned");
      return null;
    } catch (error) {
      LOG("buyTicket: error", error);
      console.error("Failed to buy ticket:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, executeTransaction, transactionStatus, refreshTickets, refreshEvents]);

  // ---- Verify Entry ----
  const verifyEntry = useCallback(async (ticket: Ticket): Promise<string | null> => {
    if (!address || !executeTransaction || !requestRecords) return null;

    LOG("verifyEntry: starting", { ticketId: ticket.id, eventId: ticket.eventId });
    try {
      setIsLoading(true);

      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID, true);
      LOG("verifyEntry: records fetched", { count: records?.length ?? 0 });

      if (!records || records.length === 0) {
        throw new Error("No ticket records found in wallet. Please ensure you have minted a ticket.");
      }

      let recordToUse: string | null = null;
      const targetEventId = ticket.eventId;
      const targetTicketId = ticket.ticketId;

      for (const recordItem of records) {
        try {
          const record = typeof recordItem === "string" ? JSON.parse(recordItem) : recordItem;
          const data = record?.data ?? record?.plaintext ?? record;
          const rawEventId = data?.event_id?.value ?? data?.event_id;
          const rawTicketId = data?.ticket_id?.value ?? data?.ticket_id;
          if (!rawEventId || !rawTicketId) continue;
          const recordEventId = String(rawEventId).replace("u64", "").replace(".private", "").trim();
          const recordTicketId = String(rawTicketId).replace("u64", "").replace(".private", "").trim();

          if (recordEventId === targetEventId && recordTicketId === targetTicketId) {
            recordToUse = typeof recordItem === "string" ? recordItem : JSON.stringify(recordItem);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!recordToUse) {
        throw new Error("Could not find matching ticket record for this event in your wallet.");
      }

      const result = await executeTransaction({
        program: PASSMEET_V1_PROGRAM_ID,
        function: "verify_entry",
        inputs: [recordToUse],
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
        LOG("verifyEntry: success", { txHash: txHash ?? tempId });
        return txHash ?? tempId;
      }
      LOG("verifyEntry: no txId returned");
      return null;
    } catch (error) {
      LOG("verifyEntry: error", error);
      console.error("Failed to verify entry:", error);
      throw error;
    } finally {
      setIsLoading(false);
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

  // ---- Mount / wallet change ----
  useEffect(() => {
    if (address) {
      LOG("wallet connected: refreshing data", { address: address.slice(0, 12) + "..." });
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
      refreshEvents().then(() => refreshTickets());
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
        isLoading,
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
