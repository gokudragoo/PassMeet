program passmeet_v1_7788.aleo {
    struct EventInfo {
        id: u64,
        organizer: address,
        capacity: u32,
        ticket_count: u32,
        price: u64
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
        public price: u64
    ) -> Future {
        return finalize_create_event(self.caller, capacity, price);
    }

    async function finalize_create_event(
        public organizer: address,
        public capacity: u32,
        public price: u64
    ) {
        let current_id: u64 = Mapping::get_or_use(event_counter, 0u8, 0u64);
        let next_id: u64 = current_id + 1u64;
        
        let new_event: EventInfo = EventInfo {
            id: next_id,
            organizer: organizer,
            capacity: capacity,
            ticket_count: 0u32,
            price: price
        };

        Mapping::set(events, next_id, new_event);
        Mapping::set(event_counter, 0u8, next_id);
    }

    async transition mint_ticket(
        public event_id: u64,
        public ticket_id: u64
    ) -> (Ticket, Future) {
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
        
        // Ensure ticket_id is the next one
        assert(ticket_id == (event.ticket_count as u64) + 1u64);
        assert(event.ticket_count < event.capacity);
        
        let updated_event: EventInfo = EventInfo {
            id: event.id,
            organizer: event.organizer,
            capacity: event.capacity,
            ticket_count: event.ticket_count + 1u32,
            price: event.price
        };
        
        Mapping::set(events, event_id, updated_event);
    }

    async transition verify_entry(
        ticket: Ticket
    ) -> Future {
        // Generate a nullifier based on event_id and ticket_id to ensure uniqueness
        let nullifier: field = BHP256::hash_to_field(ticket.event_id + ticket.ticket_id);
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
