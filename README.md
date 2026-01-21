# PassMeet - Privacy-First Event Ticketing on Aleo

<div align="center">

![PassMeet](https://img.shields.io/badge/PassMeet-Aleo%20Testnet-1DB954?style=for-the-badge)
![Leo](https://img.shields.io/badge/Leo-3.4.0-blue?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge)

**The world's first privacy-first event ticketing platform powered by Zero-Knowledge proofs.**

[Live Demo](https://passmeet.vercel.app/) | [Explorer](https://explorer.provable.com/testnet/program/passmeet_v1_7788.aleo)

</div>

---

## Overview

PassMeet is a fully on-chain, privacy-preserving event ticketing and access control platform built on Aleo. It leverages Zero-Knowledge Proofs (ZKP) to allow attendees to purchase tickets and verify their entry at event gates **without revealing their wallet addresses or transaction history**.

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
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_ALEO_RPC_URL=https://api.explorer.provable.com/v2

# Deployed Contract Addresses
NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID=passmeet_v1_7788.aleo
NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID=passmeet_subs_7788.aleo
```

## Deploy Contracts

```bash
chmod +x deploy-all.sh
./deploy-all.sh
```

> Requires Leo 3.4.0 and WSL/Linux environment

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
    ├── aleo.ts              # Contract config
    └── pinata.ts            # IPFS utilities
```

## Privacy Guarantees

- Wallet addresses are **never** stored off-chain
- Ticket ownership is **private** by default
- Entry verification is **anonymous** - only validity is proven
- No central database - all state lives on Aleo
 
<div align="center">

**Built for Aleo Wavehack**

</div>
