import credits.aleo;
import token_registry.aleo;
program passmeet_v2_7788.aleo;

record Ticket:
    owner as address.private;
    event_id as u64.private;
    ticket_id as u64.private;

struct EventInfo:
    id as u64;
    organizer as address;
    capacity as u32;
    ticket_count as u32;
    price_credits as u128;
    price_usdcx as u128;
    price_usad as u128;

mapping event_counter:
    key as u8.public;
    value as u64.public;

mapping events:
    key as u64.public;
    value as EventInfo.public;

mapping used_tickets:
    key as field.public;
    value as boolean.public;

mapping admin:
    key as u8.public;
    value as address.public;

mapping token_ids:
    key as u8.public;
    value as field.public;

function configure_tokens:
    input r0 as field.public;
    input r1 as field.public;
    is.neq r0 0field into r2;
    assert.eq r2 true;
    is.neq r1 0field into r3;
    assert.eq r3 true;
    is.neq r0 r1 into r4;
    assert.eq r4 true;
    async configure_tokens self.caller r0 r1 into r5;
    output r5 as passmeet_v2_7788.aleo/configure_tokens.future;

finalize configure_tokens:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as field.public;
    get.or_use admin[0u8] r0 into r3;
    is.eq r3 r0 into r4;
    assert.eq r4 true;
    set r0 into admin[0u8];
    set r1 into token_ids[0u8];
    set r2 into token_ids[1u8];

function create_event:
    input r0 as u32.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    gt r0 0u32 into r4;
    assert.eq r4 true;
    async create_event self.caller r0 r1 r2 r3 into r5;
    output r5 as passmeet_v2_7788.aleo/create_event.future;

finalize create_event:
    input r0 as address.public;
    input r1 as u32.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    gt r3 0u128 into r5;
    branch.eq r5 false to end_then_0_0;
    get.or_use token_ids[0u8] 0field into r6;
    is.neq r6 0field into r7;
    assert.eq r7 true;
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;
    gt r4 0u128 into r8;
    branch.eq r8 false to end_then_0_2;
    get.or_use token_ids[1u8] 0field into r9;
    is.neq r9 0field into r10;
    assert.eq r10 true;
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;
    get.or_use event_counter[0u8] 0u64 into r11;
    add r11 1u64 into r12;
    cast r12 r0 r1 0u32 r2 r3 r4 into r13 as EventInfo;
    set r13 into events[r12];
    set r12 into event_counter[0u8];

function mint_free_ticket:
    input r0 as u64.public;
    input r1 as u64.public;
    cast self.caller r0 r1 into r2 as Ticket.record;
    async mint_free_ticket self.caller r0 r1 into r3;
    output r2 as Ticket.record;
    output r3 as passmeet_v2_7788.aleo/mint_free_ticket.future;

finalize mint_free_ticket:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as u64.public;
    get events[r1] into r3;
    is.eq r3.price_credits 0u128 into r4;
    assert.eq r4 true;
    is.eq r3.price_usdcx 0u128 into r5;
    assert.eq r5 true;
    is.eq r3.price_usad 0u128 into r6;
    assert.eq r6 true;
    cast r3.ticket_count into r7 as u64;
    add r7 1u64 into r8;
    is.eq r2 r8 into r9;
    assert.eq r9 true;
    lt r3.ticket_count r3.capacity into r10;
    assert.eq r10 true;
    add r3.ticket_count 1u32 into r11;
    cast r3.id r3.organizer r3.capacity r11 r3.price_credits r3.price_usdcx r3.price_usad into r12 as EventInfo;
    set r12 into events[r1];

function purchase_ticket_with_credits:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    input r3 as u64.public;
    input r4 as credits.aleo/credits.record;
    is.eq r4.owner self.caller into r5;
    assert.eq r5 true;
    gt r3 0u64 into r6;
    assert.eq r6 true;
    gte r4.microcredits r3 into r7;
    assert.eq r7 true;
    call credits.aleo/transfer_private r4 r2 r3 into r8 r9;
    cast self.caller r0 r1 into r10 as Ticket.record;
    async purchase_ticket_with_credits r0 r1 r2 r3 into r11;
    output r10 as Ticket.record;
    output r8 as credits.aleo/credits.record;
    output r9 as credits.aleo/credits.record;
    output r11 as passmeet_v2_7788.aleo/purchase_ticket_with_credits.future;

finalize purchase_ticket_with_credits:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    input r3 as u64.public;
    get events[r0] into r4;
    is.eq r4.organizer r2 into r5;
    assert.eq r5 true;
    gt r4.price_credits 0u128 into r6;
    assert.eq r6 true;
    cast r3 into r7 as u128;
    is.eq r4.price_credits r7 into r8;
    assert.eq r8 true;
    cast r4.ticket_count into r9 as u64;
    add r9 1u64 into r10;
    is.eq r1 r10 into r11;
    assert.eq r11 true;
    lt r4.ticket_count r4.capacity into r12;
    assert.eq r12 true;
    add r4.ticket_count 1u32 into r13;
    cast r4.id r4.organizer r4.capacity r13 r4.price_credits r4.price_usdcx r4.price_usad into r14 as EventInfo;
    set r14 into events[r0];

function purchase_ticket:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    input r3 as u128.public;
    input r4 as field.public;
    input r5 as token_registry.aleo/Token.record;
    is.eq r5.owner self.caller into r6;
    assert.eq r6 true;
    is.eq r5.token_id r4 into r7;
    assert.eq r7 true;
    gt r3 0u128 into r8;
    assert.eq r8 true;
    gte r5.amount r3 into r9;
    assert.eq r9 true;
    call token_registry.aleo/transfer_private r2 r3 r5 into r10 r11 r12;
    cast self.caller r0 r1 into r13 as Ticket.record;
    async purchase_ticket r0 r1 r2 r3 r4 r12 into r14;
    output r13 as Ticket.record;
    output r10 as token_registry.aleo/Token.record;
    output r11 as token_registry.aleo/Token.record;
    output r14 as passmeet_v2_7788.aleo/purchase_ticket.future;

finalize purchase_ticket:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    input r3 as u128.public;
    input r4 as field.public;
    input r5 as token_registry.aleo/transfer_private.future;
    await r5;
    get.or_use token_ids[0u8] 0field into r6;
    get.or_use token_ids[1u8] 0field into r7;
    is.neq r6 0field into r8;
    assert.eq r8 true;
    is.neq r7 0field into r9;
    assert.eq r9 true;
    get events[r0] into r10;
    is.eq r10.organizer r2 into r11;
    assert.eq r11 true;
    is.eq r4 r6 into r12;
    branch.eq r12 false to end_then_0_4;
    gt r10.price_usdcx 0u128 into r13;
    assert.eq r13 true;
    is.eq r10.price_usdcx r3 into r14;
    assert.eq r14 true;
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    is.eq r4 r7 into r15;
    assert.eq r15 true;
    gt r10.price_usad 0u128 into r16;
    assert.eq r16 true;
    is.eq r10.price_usad r3 into r17;
    assert.eq r17 true;
    position end_otherwise_0_5;
    cast r10.ticket_count into r18 as u64;
    add r18 1u64 into r19;
    is.eq r1 r19 into r20;
    assert.eq r20 true;
    lt r10.ticket_count r10.capacity into r21;
    assert.eq r21 true;
    add r10.ticket_count 1u32 into r22;
    cast r10.id r10.organizer r10.capacity r22 r10.price_credits r10.price_usdcx r10.price_usad into r23 as EventInfo;
    set r23 into events[r0];

function verify_entry:
    input r0 as Ticket.record;
    cast r0.event_id into r1 as u128;
    cast r0.ticket_id into r2 as u128;
    mul r2 18446744073709551616u128 into r3;
    add r1 r3 into r4;
    cast r4 into r5 as field;
    hash.bhp256 r5 into r6 as field;
    async verify_entry r6 into r7;
    output r7 as passmeet_v2_7788.aleo/verify_entry.future;

finalize verify_entry:
    input r0 as field.public;
    get.or_use used_tickets[r0] false into r1;
    not r1 into r2;
    assert.eq r2 true;
    set true into used_tickets[r0];

constructor:
    assert.eq edition 0u16;
