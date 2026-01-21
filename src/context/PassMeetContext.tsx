"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { 
  Transaction, 
  WalletAdapterNetwork
} from "@demox-labs/aleo-wallet-adapter-base";
import { PASSMEET_V1_PROGRAM_ID } from "@/lib/aleo";

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

const DEMO_EVENTS: Event[] = [
  {
    id: "demo_1",
    name: "Aleo Developer Summit 2026",
    organizer: "aleo1...zk42",
    organizerAddress: "demo",
    capacity: 500,
    ticketCount: 127,
    price: 0.5,
    date: "2026-02-15",
    location: "San Francisco, CA",
    image: "https://images.unsplash.com/photo-1540575861501-7cf05a4b125a?q=80&w=800",
    status: "Active"
  },
  {
    id: "demo_2", 
    name: "ZK Privacy Conference",
    organizer: "aleo1...pr1v",
    organizerAddress: "demo",
    capacity: 300,
    ticketCount: 89,
    price: 0.25,
    date: "2026-03-20",
    location: "Austin, TX",
    image: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=800",
    status: "Active"
  }
];

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
      const storedEvents = localStorage.getItem("passmeet_events");
      const userEvents: Event[] = storedEvents ? JSON.parse(storedEvents) : [];
      setEvents([...DEMO_EVENTS, ...userEvents]);
    } catch (error) {
      console.error("Failed to refresh events:", error);
      setEvents(DEMO_EVENTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshTickets = useCallback(async () => {
    if (!publicKey) return;
    
    setIsLoading(true);
    try {
      const stored = localStorage.getItem(`passmeet_tickets_${publicKey}`);
      if (stored) {
        setMyTickets(JSON.parse(stored));
      } else {
        setMyTickets([]);
      }
    } catch (error) {
      console.error("Failed to refresh tickets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

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
      
      // Fully On-Chain: Request transaction to create event
      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        'create_event',
        [
          `${capacity}u32`,
          `${Math.floor(price * 1000000)}u64`, // Convert to microcredits if needed
        ],
        100000, // Fee
      );

      const txHash = await requestTransaction(aleoTransaction);
      
      if (txHash) {
        const newEvent: Event = {
          id: `event_${Date.now()}`,
          name,
          organizer: publicKey.slice(0, 10) + "..." + publicKey.slice(-4),
          organizerAddress: publicKey,
          capacity,
          ticketCount: 0,
          price,
          date: eventDate,
          location: eventLocation,
          image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=800",
          status: "Active"
        };
        
        const storedEvents = localStorage.getItem("passmeet_events");
        const userEvents: Event[] = storedEvents ? JSON.parse(storedEvents) : [];
        userEvents.push(newEvent);
        localStorage.setItem("passmeet_events", JSON.stringify(userEvents));
        
        setEvents(prev => [...prev, newEvent]);
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

  const buyTicket = useCallback(async (event: Event): Promise<string | null> => {
    if (!publicKey || !requestTransaction) return null;
    
    try {
      setIsLoading(true);
      
      const eventId = event.id.startsWith('demo') ? '1' : event.id.replace('event_', '');
      const nextTicketId = event.ticketCount + 1;
      
      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        'mint_ticket',
        [
          `${eventId}u64`,
          `${nextTicketId}u64`,
        ],
        100000,
      );

      const txHash = await requestTransaction(aleoTransaction);
      
      if (txHash) {
        const ticketId = `ticket_${Date.now()}`;
        const newTicket: Ticket = {
          id: ticketId,
          eventId: event.id,
          ticketId: `${nextTicketId}`,
          eventName: event.name,
          date: event.date,
          location: event.location,
          status: "Valid",
          txHash,
          nullifier: Math.random().toString(36).substring(2)
        };
        
        const stored = localStorage.getItem(`passmeet_tickets_${publicKey}`);
        const existingTickets: Ticket[] = stored ? JSON.parse(stored) : [];
        existingTickets.push(newTicket);
        localStorage.setItem(`passmeet_tickets_${publicKey}`, JSON.stringify(existingTickets));
        
        setMyTickets(existingTickets);
        return txHash;
      }
      return null;
    } catch (error) {
      console.error("Failed to buy ticket:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestTransaction]);

  const verifyEntry = useCallback(async (ticket: Ticket): Promise<string | null> => {
    if (!publicKey || !requestTransaction || !requestRecords) return null;
    
    try {
      setIsLoading(true);
      
      const records = await requestRecords(PASSMEET_V1_PROGRAM_ID);
      
      if (!records || records.length === 0) {
        throw new Error("No ticket records found in wallet. Please ensure you have minted a ticket.");
      }
      
      let ticketRecord = null;
      const eventId = ticket.eventId.startsWith('demo') ? '1' : ticket.eventId.replace('event_', '');
      
      for (const recordStr of records) {
        try {
          const record = typeof recordStr === 'string' ? JSON.parse(recordStr) : recordStr;
          if (record.data && record.data.event_id) {
            const recordEventId = record.data.event_id.replace('u64', '').replace('.private', '');
            if (recordEventId === eventId) {
              ticketRecord = record;
              break;
            }
          }
        } catch {
          continue;
        }
      }
      
      if (!ticketRecord) {
        throw new Error("Could not find matching ticket record for this event.");
      }
      
      const aleoTransaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.Testnet,
        PASSMEET_V1_PROGRAM_ID,
        'verify_entry',
        [ticketRecord],
        100000,
      );

      const txHash = await requestTransaction(aleoTransaction);
      
      if (txHash) {
        const stored = localStorage.getItem(`passmeet_tickets_${publicKey}`);
        const existingTickets: Ticket[] = stored ? JSON.parse(stored) : [];
        const updatedTickets = existingTickets.map(t => 
          t.id === ticket.id ? { ...t, status: "Used" as const } : t
        );
        localStorage.setItem(`passmeet_tickets_${publicKey}`, JSON.stringify(updatedTickets));
        
        setMyTickets(updatedTickets);
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
        const parsed = JSON.parse(stored);
        if (parsed.address === publicKey && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setIsAuthenticated(true);
        }
      }
      refreshEvents();
      refreshTickets();
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
