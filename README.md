# PassMeet - Privacy-First Event Ticketing on Aleo

<div align="center">

![PassMeet](https://img.shields.io/badge/PassMeet-Aleo%20Testnet-1DB954?style=for-the-badge)
![Leo](https://img.shields.io/badge/Leo-3.4.0-blue?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge)

**The world's first privacy-first event ticketing platform powered by Zero-Knowledge proofs.**

[Live Demo](https://passmeet.vercel.app/) | [Demo Video](https://youtu.be/lnh7xxyln7w) | [Explorer](https://explorer.provable.com/testnet/program/passmeet_v1_7788.aleo)

</div>

---

## 1. Project Overview

### Name & Description

**PassMeet** is a fully on-chain, privacy-preserving event ticketing and access control platform built on Aleo. Attendees purchase tickets and verify entry at event gates **without revealing wallet addresses or transaction history** — powered by Zero-Knowledge Proofs (ZKP).

### Problem Being Solved

- **Traditional ticketing** exposes attendee identities, purchase history, and wallet addresses to organizers and third parties.
- **Centralized platforms** hold sensitive data, enabling profiling, resale tracking, and privacy breaches.
- **QR-based systems** are easily forged and offer no cryptographic guarantees.

PassMeet solves this by making tickets **private by default**, entry verification **anonymous**, and all state **on-chain** — no central database.

### Why Privacy Matters for This Use Case

| Concern | How PassMeet Addresses It |
|---------|---------------------------|
| **Identity exposure** | Organizers see only "valid ticket" at the gate, never wallet or identity |
| **Purchase history** | Ticket records are private; no one can trace which events you attended |
| **Resale / scalping** | Tickets are cryptographically bound; selective disclosure possible for future features |
| **Data breaches** | No central database of attendees; state lives on Aleo |
| **Surveillance** | Zero-knowledge proofs prove validity without revealing anything else |

### Product-Market Fit (PMF) & Go-To-Market (GTM) Plan

| PMF | Target: Privacy-conscious event organizers and attendees (conferences, meetups, exclusive events). Value: Trustless, private ticketing with ZK verification. |
|-----|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **GTM** | 1) Partner with Aleo ecosystem events for pilot; 2) Integrate with existing event tools (Calendly, Luma); 3) Launch on mainnet post-testnet validation; 4) Community-driven adoption via hackathons and grants. |

---

## 2. Working Demo

| Requirement | Status |
|-------------|--------|
| **Deployed on Aleo Testnet** | ✅ Live at [passmeet.vercel.app](https://passmeet.vercel.app/) — [Watch Demo](https://youtu.be/lnh7xxyln7w) |
| **Functional Leo Smart Contracts** | ✅ `passmeet_v1_7788.aleo` (events, tickets, verify_entry) + `passmeet_subs_7788.aleo` (subscriptions) |
| **Basic UI Demonstrating Core Features** | ✅ Landing, Organizer, My Tickets, Gate, Subscription — full flow works |

**Core flows verified:**
- Create event → Mint ticket → Generate ZK proof → Verify entry on-chain
- Leo Wallet, Puzzle Wallet, Fox Wallet supported

## Deployed Contracts (Aleo Testnet)

| Contract | Program ID | Transaction ID |
|----------|-----------|----------------|
| **Main Event Contract** | `passmeet_v1_7788.aleo` | `at1lkxmqgcxqy8df6tqsue26pn9qpq49pvtep6c62sm4dmjxq7y6cxsr6uuxs` |
| **Subscription Contract** | `passmeet_subs_7788.aleo` | `at16s6m4frqkd597tpmvayjpl97ul9es5n8e77kpr6t86muwc3mf5psjthker` |

> **Network:** Aleo Testnet | **RPC:** `https://api.explorer.provable.com/v2`

## Key Features

| Feature | Description |
|---------|-------------|
| **On-Chain Events** | All events are created and managed directly on the Aleo blockchain |
| **Private Ticket Minting** | Tickets are minted as private Aleo records. Ownership is cryptographically hidden |
| **ZK-Proof Entry** | Gate verification uses one-time Zero-Knowledge proofs. Organizers only see validity, never identity |
| **Nullifier-Based Anti-Replay** | Each ticket can only be used once, enforced by on-chain nullifiers |
| **Wallet Signature Auth** | Users sign a message to verify identity without exposing private keys |
| **Subscription Tiers** | On-chain subscription model for premium organizer features |
| **IPFS Storage** | Event metadata stored on Pinata IPFS for decentralized data availability |


## 3. Technical Documentation

| Requirement | Location |
|-------------|----------|
| **GitHub Repository** | *(Add your repo URL — e.g. `https://github.com/your-org/PassMeet`)* |
| **README** | This file — setup, env vars, quick start, architecture |
| **Architecture Overview** | See [Architecture](#architecture) section below |
| **Privacy Model** | See [Privacy Guarantees](#privacy-guarantees) and [Record Format & Wallet Integration](#record-format--wallet-integration) |

---

## 4. Progress Changelog (Wave 2+)

### What We Built Since Last Submission

| Area | Improvements |
|------|--------------|
| **Minting** | Ticket minting flow refined; records handled correctly with Leo/Puzzle wallets |
| **Organizer** | Event creation and dashboard organization improved; IPFS metadata caching (60s) for faster loads |
| **Tickets** | Tickets persist per wallet in `localStorage`; survive refresh; isolated per address |
| **Gate Verification** | ZK-proof generation fixed; record format (ciphertext/plaintext) handled; `verify_entry` succeeds |
| **Wallet** | Decrypt permission set to `OnChainHistory` for record access; retries (3x) on `requestRecords`; clear NOT_GRANTED messaging |
| **Subscription** | UI price aligned with actual charge (0.1 ALEO tx fee); no misleading 15/50 ALEO display |
| **Network** | RPC/Explorer paths use `ALEO_NETWORK` (testnet/mainnet) |
| **UX** | Gate page: dynamic network label, error UX with "Refresh Tickets & Try Again"; auto-refresh on load |
| **Production** | Favicon & Apple icon; Open Graph & Twitter metadata; 404 page; loading states |

### Feedback Incorporated

- **Record format errors** — Fixed "Input is not a valid record type" by using ciphertext when present and correct owner format
- **NOT_GRANTED** — Switched to `DecryptPermission.OnChainHistory`; added clear messaging for users to disconnect/reconnect
- **Tickets disappearing on refresh** — Keep `localStorage` tickets when wallet returns empty; merge with wallet records
- **Subscription price mismatch** — UI now shows 0.1 ALEO (actual tx fee) instead of misleading 15/50 ALEO

### Next Wave Goals

- [ ] Mainnet deployment and contract migration
- [ ] Subscription payment flow (15/50 ALEO plan pricing in contract)
- [ ] Mobile-optimized gate scanner (PWA / QR flow)
- [ ] Event discovery and search (filter by date, location)
- [ ] Organizer analytics (aggregate stats without identity exposure)

## Tech Stack

| Category | Technology |
|----------|------------|
| **Blockchain** | Aleo Testnet |
| **Smart Contracts** | Leo 3.4.0 |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| **Wallet Integration** | Leo Wallet, Puzzle Wallet, Fox Wallet (aleo-adapters) |
| **Storage** | Pinata IPFS |
| **Animations** | Framer Motion |
| **UI Components** | shadcn/ui, Lucide React icons |

## Smart Contracts

Located in `contracts/`:

### passmeet_v1_7788.aleo
```
create_event(capacity, price)  -> Create events on-chain
mint_ticket(event_id, ticket_id) -> Mint private ticket records
verify_entry(ticket)           -> Gate verification using nullifiers
```

### passmeet_subs_7788.aleo
```
subscribe(tier, duration)      -> Subscribe to premium tiers
```

## Application Flow

```
Connect Wallet -> Sign Message -> Create/Browse Events -> Mint Ticket -> Generate ZK Proof -> Verify Entry
```

1. **Connect Wallet** - Leo Wallet, Puzzle Wallet, or Fox Wallet
2. **Sign to Verify** - Authenticate via wallet signature
3. **Organizer Dashboard** - Create events with capacity and price
4. **Attendee Dashboard** - Browse events and mint private tickets
5. **Gate Scanner** - Generate ZK-proof and verify on-chain

## Website Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Landing** | `/` | Hero, features, how-it-works, CTA to Get Tickets / Create Event |
| **Organizer** | `/organizer` | Create events (capacity, price, date, location); requires wallet + auth |
| **My Tickets** | `/tickets` | Browse events, mint tickets; shows owned tickets with event metadata |
| **Gate** | `/gate` | Select ticket → Generate ZK proof → `verify_entry` on-chain; shows success/fail + tx link |
| **Subscription** | `/subscription` | Tier cards (Free, Organizer Pro, Enterprise); `subscribe(tier, duration)` with 0.1 ALEO tx fee |

## RPC & External Services

| Service | Purpose |
|---------|---------|
| **Provable Explorer API** | `ALEO_RPC_URL` — mapping reads (`event_counter`, `events`, `user_subs`) |
| **testnet3.aleorpc.com** | JSON-RPC fallback for `getMappingValue` when Provable returns null |
| **Pinata** | IPFS pinning; event metadata; index of event CIDs |
| **IPFS Gateways** | Pinata, ipfs.io, cloudflare-ipfs, dweb.link (3s timeout per gateway) |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```env
# Pinata IPFS Storage
PINATA_JWT=your_pinata_jwt_token
NEXT_PUBLIC_GATEWAY_URL=https://gateway.pinata.cloud

# Aleo Network Configuration
# Use "testnet" or "mainnet". For mainnet, deploy contracts first and set program IDs.
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_ALEO_RPC_URL=https://api.explorer.provable.com/v2

# Deployed Contract Addresses (testnet by default)
NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID=passmeet_v1_7788.aleo
NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID=passmeet_subs_7788.aleo
```

## Deploy Contracts

```bash
chmod +x deploy-all.sh
./deploy-all.sh
```

> Requires Leo 3.4.0 and WSL/Linux environment

## Production Deployment

| Item | Notes |
|------|-------|
| **Favicon & Icons** | `app/icon.tsx` (32×32), `app/apple-icon.tsx` (180×180) — green ticket icon |
| **Metadata** | Open Graph, Twitter cards, `metadataBase` for canonical URLs |
| **Error Handling** | `app/error.tsx` (Try Again), `app/not-found.tsx` (404), `app/loading.tsx` (global spinner) |
| **Env for Prod** | Set `NEXT_PUBLIC_SITE_URL` for correct Open Graph URLs; ensure `PINATA_JWT` is set |

## Project Structure

```
contracts/
├── passmeet_v1_7788/        # Core event/ticket contract
└── passmeet_subs_7788/      # Subscription contract
src/
├── app/
│   ├── page.tsx             # Landing page
│   ├── organizer/           # Event creation dashboard
│   ├── tickets/             # Attendee ticket management
│   ├── gate/                # ZK-proof verification
│   └── subscription/        # Premium tier management
├── components/
│   ├── AleoWalletProvider   # Multi-wallet support
│   └── Navbar.tsx           # Navigation
├── context/
│   └── PassMeetContext.tsx  # Global on-chain state
└── lib/
    ├── aleo.ts              # ALEO_NETWORK, RPC URL, program IDs, EXPLORER_BASE, tx/program URLs
    ├── aleo-rpc.ts          # getEventCounter, getEvent — Provable + JSON-RPC fallback
    ├── aleo-subs-rpc.ts     # getSubscription — user_subs mapping
    ├── pinata.ts            # uploadToIPFS, fetchFromIPFS, saveEventMetadata, getAllEvents
    └── utils.ts             # cn() and shared utilities
```

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PassMeet Frontend                                │
│  Next.js 15 App Router │ PassMeetContext │ Aleo Wallet Adapters              │
└─────────────────────────────────────────────────────────────────────────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────────┐
│  Aleo Blockchain │     │  Pinata IPFS        │     │  Leo / Puzzle / Fox      │
│  (Testnet)       │     │  (Event Metadata)   │     │  Wallet Extensions       │
│                  │     │                     │     │                          │
│ • passmeet_v1    │     │ • Event index CID   │     │ • requestRecords        │
│ • passmeet_subs  │     │ • Per-event JSON    │     │ • executeTransaction    │
│ • Provable RPC   │     │ • 3s fetch timeout  │     │ • DecryptPermission      │
└─────────────────┘     └─────────────────────┘     └─────────────────────────┘
```

### Data Flow

| Flow | Path |
|------|------|
| **Create Event** | Organizer → `create_event` tx → Aleo; metadata → `POST /api/events` → Pinata IPFS; index updated |
| **Fetch Events** | `getEventCounter()` + `getEvent(id)` (Provable RPC + JSON-RPC fallback) → merge with `GET /api/events` → IPFS metadata |
| **Mint Ticket** | `executeTransaction(mint_ticket)` → private `Ticket` record → wallet stores; UI shows via `requestRecords` |
| **Verify Entry** | `requestRecords` → `executeTransaction(verify_entry)` with record ciphertext → nullifier set on-chain |
| **Subscription** | `executeTransaction(subscribe)` → `user_subs` mapping updated; `getSubscription(address)` reads tier/expiry |

### Frontend Architecture

| Layer | Responsibility |
|-------|----------------|
| **Layout** | Root layout, `AleoWalletProvider`, `Navbar`, `Footer`, `Toaster` |
| **PassMeetContext** | Events, tickets, auth, createEvent, buyTicket, verifyEntry, refresh; localStorage persistence for tickets |
| **Pages** | `/` (landing), `/organizer`, `/tickets`, `/gate`, `/subscription` |
| **API Routes** | `GET/POST /api/events` — proxy to Pinata; 60s cache |

### State & Persistence

| Data | Storage | Lifetime |
|------|---------|----------|
| `events` | Aleo + IPFS; `PassMeetContext` cache | On-chain permanent; IPFS index; 60s API cache |
| `myTickets` | Wallet records + `localStorage` under `passmeet_my_tickets_{address}` | Per-wallet; survives refresh when wallet returns empty |
| `event metadata` | `localStorage` under `passmeet_event_metadata` | Fallback when IPFS slow |
| `subscription` | Aleo `user_subs` + `localStorage` under `passmeet_subscription` | Per-user |

### Record Format & Wallet Integration

- **Ticket records**: Private Aleo records. `verify_entry` expects either `ciphertext` (starts with `"record1"`) or plaintext with `owner` ending in `.private`.
- **Decrypt**: `DecryptPermission.OnChainHistory` required so `requestRecords` / `requestRecordPlaintexts` works.

### Caching Strategy

| Layer | TTL / Behavior |
|-------|----------------|
| `/api/events` | 60 seconds in-memory |
| IPFS fetch | 3s timeout; fallbacks: Pinata → ipfs.io → cloudflare-ipfs → dweb.link |
| Event metadata | `localStorage` fallback; merged with on-chain data |

### IPFS Storage Model

- **Index**: Single JSON `{ events: [cid1, cid2, ...], lastUpdated }` pinned as `passmeet_events_index`.
- **Per-event**: `{ id, name, date, location, image, organizer, capacity, price }` pinned per event.
- **Create**: Upload event JSON → update index → re-pin index (unpin old index first).

---

## Privacy Guarantees

- Wallet addresses are **never** stored off-chain
- Ticket ownership is **private** by default
- Entry verification is **anonymous** - only validity is proven
- No central database - all state lives on Aleo
 
<div align="center">

**Built for Aleo Wavehack**

</div>
