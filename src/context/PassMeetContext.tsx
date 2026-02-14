"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import {
  Transaction,
  WalletAdapterNetwork
} from "@demox-labs/aleo-wallet-adapter-base";
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

export function PassMeetProvider({ children }: PassMeetProviderProps) {
  const { publicKey, signMessage, requestTransaction, requestRecords } = useWallet();
  const [events, setEvents] = useState<Event[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ---- Authentication ----
  const authenticateWithSignature = useCallback(async (): Promise<boolean> => {
    if (!publicKey) return false;

    try {
      if (signMessage) {
        const message = `PassMeet Authentication\nTimestamp: ${Date.now()}\nAddress: ${publicKey}`;
        const encoder = new TextEncoder();
        const messageBytes = encoder.encode(message);
        const signature = await signMessage(messageBytes);

        if (signature) {
          setIsAuthenticated(true);
          localStorage.setItem("passmeet_auth", JSON.stringify({
            address: publicKey,
            timestamp: Date.now()
          }));
          return true;
        }
        return false;
      } else {
        // Wallet doesn't support signMessage — fall back to connect-only auth
        setIsAuthenticated(true);
        localStorage.setItem("passmeet_auth", JSON.stringify({
          address: publicKey,
          timestamp: Date.now(),
          method: "wallet-connect"
        }));
        return true;
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      // Graceful fallback so the user isn't stuck
      setIsAuthenticated(true);
      localStorage.setItem("passmeet_auth", JSON.stringify({
        address: publicKey,
        timestamp: Date.now(),
        method: "fallback"
      }));
      return true;
    }
  }, [publicKey, signMessage]);

  // ---- Refresh Events (on-chain + metadata) ----
  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1) Get the number of events on-chain
      const maxEventId = await getEventCounter();
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
      const merged: Event[] = onChainEvents.map(({ id, data }) => {
        const idStr = String(id);
        const ipfs = ipfsMeta[idStr];
        const local = localMeta[idStr];

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
      });

      setEvents(merged);
    } catch (error) {
      console.error("Failed to refresh events:", error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Refresh Tickets (from wallet records) ----
  const refreshTickets = useCallback(async () => {
    if (!publicKey || !requestRecords) return;

    setIsLoading(true);
    try {
      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID);
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

        for (const recordStr of records) {
          try {
            const record = typeof recordStr === "string" ? JSON.parse(recordStr) : recordStr;
            const data = record?.data ?? record;
            if (!data?.event_id || !data?.ticket_id) continue;

            const eventIdRaw = String(data.event_id).replace("u64", "").replace(".private", "").trim();
            const ticketIdRaw = String(data.ticket_id).replace("u64", "").replace(".private", "").trim();

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
              recordString: typeof recordStr === "string" ? recordStr : JSON.stringify(record)
            });
          } catch {
            continue;
          }
        }
      }

      setMyTickets(tickets);
    } catch (error) {
      console.error("Failed to refresh tickets:", error);
      setMyTickets([]);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestRecords]);

  // ---- Create Event ----
  const createEvent = useCallback(async (
    name: string,
    capacity: number,
    price: number,
    eventDate: string,
    eventLocation: string
  ): Promise<string | null> => {
    if (!publicKey || !requestTransaction) return null;

    try {
      setIsLoading(true);

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        "create_event",
        [`${capacity}u32`, `${Math.floor(price * 1_000_000)}u64`],
        100_000
      );

      const prevCount = await getEventCounter();
      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        // Try to discover the new on-chain event ID by polling
        let newOnChainId: number;
        try {
          newOnChainId = await pollForNewEventId(prevCount);
        } catch {
          // If polling times out, use prevCount + 1 as best guess
          newOnChainId = prevCount + 1;
        }

        const idStr = String(newOnChainId);

        // Save metadata to localStorage immediately
        saveLocalMetadata(idStr, { name, date: eventDate, location: eventLocation });

        // Also try to save to IPFS (non-blocking, failure is OK)
        try {
          await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: newOnChainId,
              name,
              date: eventDate,
              location: eventLocation,
              organizer: publicKey,
              capacity,
              price
            })
          });
        } catch {
          // IPFS optional — localStorage is the fallback
        }

        const newEvent: Event = {
          id: idStr,
          name,
          organizer: publicKey.slice(0, 10) + "..." + publicKey.slice(-4),
          organizerAddress: publicKey,
          capacity,
          ticketCount: 0,
          price,
          date: eventDate,
          location: eventLocation,
          image: DEFAULT_IMAGE,
          status: "Active"
        };

        setEvents((prev) => [...prev, newEvent]);
        return txHash;
      }
      return null;
    } catch (error) {
      console.error("Failed to create event:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestTransaction]);

  // ---- Buy Ticket ----
  const buyTicket = useCallback(async (event: Event): Promise<string | null> => {
    if (!publicKey || !requestTransaction) return null;

    try {
      setIsLoading(true);

      const eventIdNum = parseInt(event.id, 10);
      if (isNaN(eventIdNum)) {
        throw new Error(`Invalid event ID: "${event.id}". Expected a numeric on-chain ID.`);
      }

      // Fetch the latest on-chain state to get the current ticket_count
      const onChainEvent = await getEvent(eventIdNum);
      if (!onChainEvent) {
        throw new Error(`Event #${eventIdNum} not found on-chain. It may not have been confirmed yet.`);
      }

      if (onChainEvent.ticket_count >= onChainEvent.capacity) {
        throw new Error("This event is sold out.");
      }

      const nextTicketId = onChainEvent.ticket_count + 1;

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        "mint_ticket",
        [`${eventIdNum}u64`, `${nextTicketId}u64`],
        100_000
      );

      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        // Refresh data from chain after minting
        await refreshEvents();
        await refreshTickets();
        return txHash;
      }
      return null;
    } catch (error) {
      console.error("Failed to buy ticket:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestTransaction, refreshTickets, refreshEvents]);

  // ---- Verify Entry ----
  const verifyEntry = useCallback(async (ticket: Ticket): Promise<string | null> => {
    if (!publicKey || !requestTransaction || !requestRecords) return null;

    try {
      setIsLoading(true);

      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID);

      if (!records || records.length === 0) {
        throw new Error("No ticket records found in wallet. Please ensure you have minted a ticket.");
      }

      let recordToUse: string | null = null;
      const targetEventId = ticket.eventId;
      const targetTicketId = ticket.ticketId;

      for (const recordStr of records) {
        try {
          const record = typeof recordStr === "string" ? JSON.parse(recordStr) : recordStr;
          const data = record?.data ?? record;
          if (!data?.event_id || !data?.ticket_id) continue;

          const recordEventId = String(data.event_id).replace("u64", "").replace(".private", "").trim();
          const recordTicketId = String(data.ticket_id).replace("u64", "").replace(".private", "").trim();

          if (recordEventId === targetEventId && recordTicketId === targetTicketId) {
            recordToUse = typeof recordStr === "string" ? recordStr : JSON.stringify(record);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!recordToUse) {
        throw new Error("Could not find matching ticket record for this event in your wallet.");
      }

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        "verify_entry",
        [recordToUse],
        100_000
      );

      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        setMyTickets((prev) =>
          prev.map((t) =>
            t.id === ticket.id ? { ...t, status: "Used" as const } : t
          )
        );
        return txHash;
      }
      return null;
    } catch (error) {
      console.error("Failed to verify entry:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestTransaction, requestRecords]);

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
    if (publicKey) {
      // Restore cached auth
      const stored = localStorage.getItem("passmeet_auth");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.address === publicKey && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
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
  }, [publicKey, refreshEvents, refreshTickets]);

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
