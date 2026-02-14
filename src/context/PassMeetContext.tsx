"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import {
  Transaction,
  WalletAdapterNetwork
} from "@demox-labs/aleo-wallet-adapter-base";
import { PASSMEET_V1_PROGRAM_ID } from "@/lib/aleo";
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

export function PassMeetProvider({ children }: PassMeetProviderProps) {
  const { publicKey, signMessage, requestTransaction, requestRecords } = useWallet();
  const [events, setEvents] = useState<Event[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
      setIsAuthenticated(true);
      localStorage.setItem("passmeet_auth", JSON.stringify({
        address: publicKey,
        timestamp: Date.now(),
        method: "fallback"
      }));
      return true;
    }
  }, [publicKey, signMessage]);

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const maxEventId = await getEventCounter();
      const onChainEvents: Event[] = [];

      for (let id = 1; id <= maxEventId; id++) {
        const onChain = await getEvent(id);
        if (!onChain) continue;

        const metadata = await fetchEventMetadata(id);
        const organizerShort = onChain.organizer
          ? `${onChain.organizer.slice(0, 10)}...${onChain.organizer.slice(-4)}`
          : "Unknown";

        onChainEvents.push({
          id: String(id),
          name: metadata?.name ?? `Event #${id}`,
          organizer: metadata?.organizer ?? organizerShort,
          organizerAddress: onChain.organizer,
          capacity: onChain.capacity,
          ticketCount: onChain.ticket_count,
          price: onChain.price / 1_000_000,
          date: metadata?.date ?? "",
          location: metadata?.location ?? "",
          image: metadata?.image ?? DEFAULT_IMAGE,
          status: "Active"
        });
      }

      const storedMetadata = localStorage.getItem("passmeet_event_metadata");
      const metadataMap: Record<string, { name: string; date: string; location: string }> = storedMetadata
        ? JSON.parse(storedMetadata)
        : {};

      const merged = onChainEvents.map((e) => {
        const meta = metadataMap[e.id];
        if (meta) {
          return { ...e, name: meta.name || e.name, date: meta.date || e.date, location: meta.location || e.location };
        }
        return e;
      });

      setEvents(merged);
    } catch (error) {
      console.error("Failed to refresh events:", error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function fetchEventMetadata(eventId: number): Promise<{ name: string; date: string; location: string; image?: string; organizer?: string } | null> {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) return null;
      const { events: ipfsEvents } = await res.json();
      const found = ipfsEvents?.find((e: { id: string | number }) => String(e.id) === String(eventId));
      return found ? { name: found.name, date: found.date, location: found.location, image: found.image, organizer: found.organizer } : null;
    } catch {
      return null;
    }
  }

  const refreshTickets = useCallback(async () => {
    if (!publicKey || !requestRecords) return;

    setIsLoading(true);
    try {
      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID);
      const tickets: Ticket[] = [];

      if (records && records.length > 0) {
        const currentEvents = await fetchEventsForTickets();

        for (const recordStr of records) {
          try {
            const record = typeof recordStr === "string" ? JSON.parse(recordStr) : recordStr;
            const data = record?.data ?? record;
            if (!data?.event_id || !data?.ticket_id) continue;

            const eventIdRaw = String(data.event_id).replace("u64", "").replace(".private", "").trim();
            const ticketIdRaw = String(data.ticket_id).replace("u64", "").replace(".private", "").trim();
            const eventId = eventIdRaw;
            const ticketId = ticketIdRaw;

            const event = currentEvents.find((e) => e.id === eventId);

            tickets.push({
              id: `ticket_${eventId}_${ticketId}`,
              eventId,
              ticketId,
              eventName: event?.name ?? `Event #${eventId}`,
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

  async function fetchEventsForTickets(): Promise<Event[]> {
    const maxEventId = await getEventCounter();
    const result: Event[] = [];
    for (let id = 1; id <= maxEventId; id++) {
      const onChain = await getEvent(id);
      if (!onChain) continue;
      const metadata = await fetchEventMetadata(id);
      result.push({
        id: String(id),
        name: metadata?.name ?? `Event #${id}`,
        organizer: "",
        organizerAddress: onChain.organizer,
        capacity: onChain.capacity,
        ticketCount: onChain.ticket_count,
        price: onChain.price / 1_000_000,
        date: metadata?.date ?? "",
        location: metadata?.location ?? "",
        image: metadata?.image ?? DEFAULT_IMAGE,
        status: "Active"
      });
    }
    return result;
  }

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
        100000
      );

      const prevCount = await getEventCounter();
      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        const newOnChainId = await pollForNewEventId(prevCount);
        const newEvent: Event = {
          id: String(newOnChainId),
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

        const metadataMap = JSON.parse(localStorage.getItem("passmeet_event_metadata") || "{}");
        metadataMap[newEvent.id] = { name, date: eventDate, location: eventLocation };
        localStorage.setItem("passmeet_event_metadata", JSON.stringify(metadataMap));

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
          // IPFS optional - metadata in localStorage is fallback
        }

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

  async function pollForNewEventId(prevCount: number, maxAttempts = 10): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const count = await getEventCounter();
      if (count > prevCount) return count;
    }
    throw new Error("Could not determine new event ID from chain");
  }

  const buyTicket = useCallback(async (event: Event): Promise<string | null> => {
    if (!publicKey || !requestTransaction) return null;

    try {
      setIsLoading(true);

      const eventIdNum = parseInt(event.id, 10);
      if (isNaN(eventIdNum)) {
        throw new Error("Invalid event ID");
      }

      const onChainEvent = await getEvent(eventIdNum);
      if (!onChainEvent) {
        throw new Error("Event not found on-chain");
      }

      const nextTicketId = onChainEvent.ticket_count + 1;

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        "mint_ticket",
        [`${eventIdNum}u64`, `${nextTicketId}u64`],
        100000
      );

      const txHash = await requestTransaction(aleoTransaction);

      if (txHash) {
        await refreshTickets();
        await refreshEvents();
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
        throw new Error("Could not find matching ticket record for this event.");
      }

      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        "verify_entry",
        [recordToUse],
        100000
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

  useEffect(() => {
    if (publicKey) {
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

export { PASSMEET_V1_PROGRAM_ID };
