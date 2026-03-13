// PassMeet Event & Ticket Contract - Production Hardened
// Per-rail pricing (credits, USDCx, USAD), mint_free_ticket, collision-free nullifiers
// Paid flow: client calls credits.aleo/transfer_private then mint_ticket (or purchase_ticket when token_registry is integrated)

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

    @noupgrade
    async constructor() {}

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
    // For token_registry (USDCx, USAD): use purchase_ticket when integrated
    async transition mint_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) -> (Ticket, Future) {
        let event: EventInfo = Mapping::get(events, event_id);
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);

        let ticket: Ticket = Ticket {
            owner: self.caller,
            event_id: event_id,
            ticket_id: ticket_id
        };
        return (ticket, finalize_mint_ticket(event_id, ticket_id));
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
