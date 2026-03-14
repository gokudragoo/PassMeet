# PassMeet Testnet Release Report (March 14, 2026)

This report summarizes what was implemented to harden PassMeet for an Aleo Testnet release, what was verified, and what remains as future work.

## What’s Shipped

### Payments (Hackathon Compliance)

- Stablecoin rails are now real (no placeholder token IDs). USDCx and USAD are handled via `token_registry.aleo` using a single payment primitive.
- Ticket purchasing is atomic for paid rails: transfer + mint happens in one on-chain flow, so sold-out/stale `ticket_id` failures do not charge the buyer.
- Subscription purchasing is atomic for paid rails and stores validity using chain `block.height`.

### Minting + Gate Reliability

- Client-side minting now retries the `ticket_id` concurrency edge case by re-reading on-chain `ticket_count` before each attempt.
- Gate verification (`verify_entry`) uses wallet-native records and no longer injects non-standard `version` fields into fallback record formatting.
- Transaction state handling is explicit and confirmation is required before showing success (no “phantom success”).

### Privacy Model Fix (Nullifiers)

- Nullifier generation for gate verification is now unpredictable to third parties by hashing a collision-free tuple that includes the private ticket owner:
  - `hash(ticket_owner, event_id, ticket_id) -> field`

### Security + Ops Hardening

- Auth sessions are server-verified wallet signatures using HttpOnly cookies.
- Added best-effort per-IP rate limiting for auth routes (`nonce` and `verify`).
- Removed dev-only build tooling and restricted Next.js image host allowlist.
- `npm audit` is clean (0 known vulnerabilities), including overrides to lift nested `zod` versions in Puzzle dependencies.
- Removed legacy scripts that contained hardcoded private keys and placeholder token IDs.

## Program IDs (This Release)

These programs are `@noupgrade`, so any contract change requires a new program ID deployment.

- Events/Tickets: `passmeet_v3_7788.aleo`
- Subscriptions: `passmeet_subs_v3_7788.aleo`

## Verification (Local)

Green checks in this workspace:

- `npm run lint`
- `npm run test:run`
- `npm run build`
- Leo contract build: `bash scripts/build-leo.sh` (WSL)
- `npm audit` (0 vulnerabilities)

## Deployment Checklist (Testnet)

1. Generate and set a real auth secret:
  - `node scripts/generate_auth_secret.mjs`
  - Copy `PASSMEET_AUTH_SECRET` into Vercel env
2. Register + mint USDCx/USAD test tokens (one-time):
  - `bash scripts/register_and_mint_tokens.sh`
  - Verify: `bash scripts/check_tokens.sh`
3. Deploy contracts (WSL, prompts for key):
  - `export NETWORK=testnet`
  - `export ENDPOINT=https://api.explorer.provable.com/v1`
  - `bash scripts/deploy-leo.sh`
4. Update deployment env:
  - `NEXT_PUBLIC_PASSMEET_V1_PROGRAM_ID=passmeet_v3_7788.aleo`
  - `NEXT_PUBLIC_PASSMEET_SUBS_PROGRAM_ID=passmeet_subs_v3_7788.aleo`
  - `NEXT_PUBLIC_USDCX_TOKEN_ID=7788001field`
  - `NEXT_PUBLIC_USAD_TOKEN_ID=7788002field`
5. One-time on-chain configuration (admin):
  - Organizer: call `configure_tokens(usdcx, usad)`
  - Subscription: call `configure(treasury, usdcx, usad)`
6. Optional (recommended): configure IPFS metadata persistence:
  - Set `PINATA_JWT` and `NEXT_PUBLIC_GATEWAY_URL`

## Known Limitations (Future Work)

- Subscription tiers are on-chain but feature enforcement is still mostly a product/UI roadmap item.
- No on-chain event update/cancel transitions yet.
- Event metadata durability is best with IPFS configured; production deployments should add a durable index/database.
- Broader wallet-matrix testing (Shield/Leo/Puzzle/Fox) should be repeated after every contract bump.

