// PassMeet Event & Ticket Contract - Production Hardened
// Per-rail pricing (credits, USDCx, USAD), mint_free_ticket, collision-free nullifiers
// Paid flow is enforced on-chain: purchase_ticket (token_registry) / purchase_ticket_with_credits (credits.aleo)

import credits.aleo;
import token_registry.aleo;

program passmeet_v1_7788.aleo {
    struct EventInfo {
        id: u64,
        organizer: address,
        capacity: u32,
        ticket_count: u32,
        price_credits: u128,
        price_usdcx: u128,
        price_usad: u128
    }

    record Ticket {
        owner: address,
        event_id: u64,
        ticket_id: u64
    }

    mapping event_counter: u8 => u64;
    mapping events: u64 => EventInfo;
    mapping used_tickets: field => bool;

    // Config (set once by admin)
    mapping admin: u8 => address;
    // token_ids[0] = USDCx, token_ids[1] = USAD. 0field means unset.
    mapping token_ids: u8 => field;

    @noupgrade
    async constructor() {}

    // One-time (or admin-only) token config for token_registry payments.
    async transition configure_tokens(
        public usdcx_token_id: field,
        public usad_token_id: field
    ) -> Future {
        assert(usdcx_token_id != 0field);
        assert(usad_token_id != 0field);
        assert(usdcx_token_id != usad_token_id);
        return finalize_configure_tokens(self.caller, usdcx_token_id, usad_token_id);
    }

    async function finalize_configure_tokens(
        public caller: address,
        public usdcx_token_id: field,
        public usad_token_id: field
    ) {
        let current_admin: address = Mapping::get_or_use(admin, 0u8, caller);
        assert(current_admin == caller);
        Mapping::set(admin, 0u8, caller);
        Mapping::set(token_ids, 0u8, usdcx_token_id);
        Mapping::set(token_ids, 1u8, usad_token_id);
    }

    async transition create_event(
        public capacity: u32,
        public price_credits: u128,
        public price_usdcx: u128,
        public price_usad: u128
    ) -> Future {
        assert(capacity > 0u32);
        // Don't allow "priced" token rails until token IDs are configured.
        if (price_usdcx > 0u128) {
            let usdcx_id: field = Mapping::get_or_use(token_ids, 0u8, 0field);
            assert(usdcx_id != 0field);
        }
        if (price_usad > 0u128) {
            let usad_id: field = Mapping::get_or_use(token_ids, 1u8, 0field);
            assert(usad_id != 0field);
        }
        return finalize_create_event(self.caller, capacity, price_credits, price_usdcx, price_usad);
    }

    async function finalize_create_event(
        public organizer: address,
        public capacity: u32,
        public price_credits: u128,
        public price_usdcx: u128,
        public price_usad: u128
    ) {
        let current_id: u64 = Mapping::get_or_use(event_counter, 0u8, 0u64);
        let next_id: u64 = current_id + 1u64;

        let new_event: EventInfo = EventInfo {
            id: next_id,
            organizer: organizer,
            capacity: capacity,
            ticket_count: 0u32,
            price_credits: price_credits,
            price_usdcx: price_usdcx,
            price_usad: price_usad
        };

        Mapping::set(events, next_id, new_event);
        Mapping::set(event_counter, 0u8, next_id);
    }

    // Free mint: only when all rails are 0
    async transition mint_free_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) -> (Ticket, Future) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.price_credits == 0u128);
        assert(event.price_usdcx == 0u128);
        assert(event.price_usad == 0u128);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);

        let ticket: Ticket = Ticket {
            owner: self.caller,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, finalize_mint_ticket(event_id, ticket_id));
    }

    // Paid mint: client must first call credits.aleo/transfer_private
    // Legacy mint: restricted to free events so paid events cannot be minted without payment.
    async transition mint_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) -> (Ticket, Future) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.price_credits == 0u128);
        assert(event.price_usdcx == 0u128);
        assert(event.price_usad == 0u128);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);

        let ticket: Ticket = Ticket {
            owner: self.caller,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, finalize_mint_ticket(event_id, ticket_id));
    }

    // Atomic paid purchase (credits.aleo). Transfers private credits to the organizer and mints the ticket in the same tx.
    async transition purchase_ticket_with_credits(
        public event_id: u64,
        public ticket_id: u64,
        payment_record: credits.aleo/credits
    ) -> (Ticket, credits.aleo/credits, credits.aleo/credits, Future) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.price_credits > 0u128);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);
        assert(payment_record.owner == self.caller);

        // credits.aleo uses u64 microcredits
        assert(event.price_credits <= 18_446_744_073_709_551_615u128);
        let price_u64: u64 = event.price_credits as u64;
        assert(payment_record.microcredits >= price_u64);

        let (to_organizer, change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(payment_record, event.organizer, price_u64);

        let ticket: Ticket = Ticket {
            owner: self.caller,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, to_organizer, change, finalize_mint_ticket(event_id, ticket_id));
    }

    // Atomic paid purchase (token_registry). Supports USDCx and USAD based on configured token IDs.
    async transition purchase_ticket(
        public event_id: u64,
        public ticket_id: u64,
        payment_record: token_registry.aleo/Token
    ) -> (Ticket, token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);
        assert(payment_record.owner == self.caller);

        let usdcx_id: field = Mapping::get_or_use(token_ids, 0u8, 0field);
        let usad_id: field = Mapping::get_or_use(token_ids, 1u8, 0field);
        assert(usdcx_id != 0field);
        assert(usad_id != 0field);

        let expected_amount: u128 = 0u128;
        if (payment_record.token_id == usdcx_id) {
            expected_amount = event.price_usdcx;
        } else {
            if (payment_record.token_id == usad_id) {
                expected_amount = event.price_usad;
            } else {
                assert(false);
            }
        }
        assert(expected_amount > 0u128);
        assert(payment_record.amount >= expected_amount);

        let (change, to_organizer, transfer_future): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(event.organizer, expected_amount, payment_record);

        let ticket: Ticket = Ticket {
            owner: self.caller,
            event_id: event_id,
            ticket_id: ticket_id
        };

        return (ticket, change, to_organizer, finalize_purchase_ticket(event_id, ticket_id, transfer_future));
    }

    async function finalize_purchase_ticket(
        public event_id: u64,
        public ticket_id: u64,
        transfer_future: Future
    ) {
        await transfer_future;

        let event: EventInfo = Mapping::get(events, event_id);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);

        let updated_event: EventInfo = EventInfo {
            id: event.id,
            organizer: event.organizer,
            capacity: event.capacity,
            ticket_count: event.ticket_count + 1u32,
            price_credits: event.price_credits,
            price_usdcx: event.price_usdcx,
            price_usad: event.price_usad
        };

        Mapping::set(events, event_id, updated_event);
    }

    async function finalize_mint_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);

        let updated_event: EventInfo = EventInfo {
            id: event.id,
            organizer: event.organizer,
            capacity: event.capacity,
            ticket_count: event.ticket_count + 1u32,
            price_credits: event.price_credits,
            price_usdcx: event.price_usdcx,
            price_usad: event.price_usad
        };

        Mapping::set(events, event_id, updated_event);
    }

    // Collision-free nullifier: encode (event_id, ticket_id) as unique field to avoid (1,2) vs (2,1) collision
    async transition verify_entry(
        ticket: Ticket
    ) -> Future {
        let combined: u128 = (ticket.event_id as u128) + (ticket.ticket_id as u128) * 18446744073709551616u128;
        let nullifier: field = BHP256::hash_to_field(combined as field);
        return finalize_verify_entry(nullifier);
    }

    async function finalize_verify_entry(
        public nullifier: field
    ) {
        let is_used: bool = Mapping::get_or_use(used_tickets, nullifier, false);
        assert(!is_used);
        Mapping::set(used_tickets, nullifier, true);
    }
}
