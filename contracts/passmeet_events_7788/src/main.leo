// PassMeet Event & Ticket Contract - Production Hardened
// NO Mapping::get in transitions (Shield-compatible). All reads in finalize.

import credits.aleo;
import token_registry.aleo;

program passmeet_v4_7788.aleo {
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

    // Used to generate an unpredictable, collision-free nullifier for gate verification.
    // Includes the private ticket owner so third parties cannot precompute used/nullifier status.
    struct TicketNullifierKey {
        ticket_owner: address,
        event_id: u64,
        ticket_id: u64
    }

    mapping event_counter: u8 => u64;
    mapping events: u64 => EventInfo;
    mapping used_tickets: field => bool;

    mapping admin: u8 => address;
    mapping token_ids: u8 => field;

    @noupgrade
    async constructor() {}

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
        return finalize_create_event(self.caller, capacity, price_credits, price_usdcx, price_usad);
    }

    async function finalize_create_event(
        public organizer: address,
        public capacity: u32,
        public price_credits: u128,
        public price_usdcx: u128,
        public price_usad: u128
    ) {
        if (price_usdcx > 0u128) {
            let usdcx_id: field = Mapping::get_or_use(token_ids, 0u8, 0field);
            assert(usdcx_id != 0field);
        }
        if (price_usad > 0u128) {
            let usad_id: field = Mapping::get_or_use(token_ids, 1u8, 0field);
            assert(usad_id != 0field);
        }
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

    // Free mint: all validation in finalize (no Mapping reads in transition)
    async transition mint_free_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) -> (Ticket, Future) {
        let ticket: Ticket = Ticket {
            owner: self.signer,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, finalize_mint_free_ticket(self.signer, event_id, ticket_id));
    }

    async function finalize_mint_free_ticket(
        public caller: address,
        public event_id: u64,
        public ticket_id: u64
    ) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.price_credits == 0u128);
        assert(event.price_usdcx == 0u128);
        assert(event.price_usad == 0u128);
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

    // Atomic paid purchase (credits). Organizer and price passed as public; finalize verifies.
    async transition purchase_ticket_with_credits(
        public event_id: u64,
        public ticket_id: u64,
        public organizer: address,
        public price: u64,
        payment_record: credits.aleo/credits
    ) -> (Ticket, credits.aleo/credits, credits.aleo/credits, Future) {
        assert(payment_record.owner == self.signer);
        assert(price > 0u64);
        assert(payment_record.microcredits >= price);

        let (to_organizer, change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(payment_record, organizer, price);

        let ticket: Ticket = Ticket {
            owner: self.signer,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, to_organizer, change, finalize_buy_credits(event_id, ticket_id, organizer, price));
    }

    async function finalize_buy_credits(
        public event_id: u64,
        public ticket_id: u64,
        public organizer: address,
        public price: u64
    ) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.organizer == organizer);
        assert(event.price_credits > 0u128);
        assert(event.price_credits == (price as u128));
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

    // Atomic paid purchase (token_registry). Organizer and expected_amount passed as public; finalize verifies.
    async transition purchase_ticket(
        public event_id: u64,
        public ticket_id: u64,
        public organizer: address,
        public expected_amount: u128,
        public payment_token_id: field,
        payment_record: token_registry.aleo/Token
    ) -> (Ticket, token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(payment_record.owner == self.signer);
        assert(payment_record.token_id == payment_token_id);
        assert(expected_amount > 0u128);
        assert(payment_record.amount >= expected_amount);

        let (change, to_organizer, transfer_future): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(organizer, expected_amount, payment_record);

        let ticket: Ticket = Ticket {
            owner: self.signer,
            event_id: event_id,
            ticket_id: ticket_id
        };

        return (ticket, change, to_organizer, finalize_buy_token(event_id, ticket_id, organizer, expected_amount, payment_token_id, transfer_future));
    }

    async function finalize_buy_token(
        public event_id: u64,
        public ticket_id: u64,
        public organizer: address,
        public expected_amount: u128,
        public payment_token_id: field,
        transfer_future: Future
    ) {
        transfer_future.await();

        let usdcx_id: field = Mapping::get_or_use(token_ids, 0u8, 0field);
        let usad_id: field = Mapping::get_or_use(token_ids, 1u8, 0field);
        assert(usdcx_id != 0field);
        assert(usad_id != 0field);

        let event: EventInfo = Mapping::get(events, event_id);
        assert(event.organizer == organizer);
        if (payment_token_id == usdcx_id) {
            assert(event.price_usdcx > 0u128);
            assert(event.price_usdcx == expected_amount);
        } else {
            assert(payment_token_id == usad_id);
            assert(event.price_usad > 0u128);
            assert(event.price_usad == expected_amount);
        }
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

    async transition verify_entry(
        ticket: Ticket
    ) -> Future {
        let key: TicketNullifierKey = TicketNullifierKey {
            ticket_owner: ticket.owner,
            event_id: ticket.event_id,
            ticket_id: ticket.ticket_id
        };
        let nullifier: field = BHP256::hash_to_field(key);
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
