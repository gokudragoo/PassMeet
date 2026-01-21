program passmeet_v1_7788.aleo;

record Ticket:
    owner as address.private;
    event_id as u64.private;
    ticket_id as u64.private;

struct EventInfo:
    id as u64;
    organizer as address;
    capacity as u32;
    ticket_count as u32;
    price as u64;

mapping event_counter:
    key as u8.public;
    value as u64.public;

mapping events:
    key as u64.public;
    value as EventInfo.public;

mapping used_tickets:
    key as field.public;
    value as boolean.public;

function create_event:
    input r0 as u32.public;
    input r1 as u64.public;
    async create_event self.caller r0 r1 into r2;
    output r2 as passmeet_v1_7788.aleo/create_event.future;

finalize create_event:
    input r0 as address.public;
    input r1 as u32.public;
    input r2 as u64.public;
    get.or_use event_counter[0u8] 0u64 into r3;
    add r3 1u64 into r4;
    cast r4 r0 r1 0u32 r2 into r5 as EventInfo;
    set r5 into events[r4];
    set r4 into event_counter[0u8];

function mint_ticket:
    input r0 as u64.public;
    input r1 as u64.public;
    cast self.caller r0 r1 into r2 as Ticket.record;
    async mint_ticket r0 r1 into r3;
    output r2 as Ticket.record;
    output r3 as passmeet_v1_7788.aleo/mint_ticket.future;

finalize mint_ticket:
    input r0 as u64.public;
    input r1 as u64.public;
    get events[r0] into r2;
    cast r2.ticket_count into r3 as u64;
    add r3 1u64 into r4;
    is.eq r1 r4 into r5;
    assert.eq r5 true;
    lt r2.ticket_count r2.capacity into r6;
    assert.eq r6 true;
    add r2.ticket_count 1u32 into r7;
    cast r2.id r2.organizer r2.capacity r7 r2.price into r8 as EventInfo;
    set r8 into events[r0];

function verify_entry:
    input r0 as Ticket.record;
    add r0.event_id r0.ticket_id into r1;
    hash.bhp256 r1 into r2 as field;
    async verify_entry r2 into r3;
    output r3 as passmeet_v1_7788.aleo/verify_entry.future;

finalize verify_entry:
    input r0 as field.public;
    get.or_use used_tickets[r0] false into r1;
    not r1 into r2;
    assert.eq r2 true;
    set true into used_tickets[r0];

constructor:
    assert.eq edition 0u16;
