import credits.aleo;
import token_registry.aleo;
program passmeet_subs_v3_7788.aleo;

struct Subscription:
    subscriber as address;
    tier as u8;
    start_height as u32;
    end_height as u32;

mapping user_subs:
    key as address.public;
    value as Subscription.public;

mapping admin:
    key as u8.public;
    value as address.public;

mapping treasury:
    key as u8.public;
    value as address.public;

mapping token_ids:
    key as u8.public;
    value as field.public;

function configure:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as field.public;
    is.neq r0 passmeet_subs_v3_7788.aleo into r3;
    assert.eq r3 true;
    is.neq r1 0field into r4;
    assert.eq r4 true;
    is.neq r2 0field into r5;
    assert.eq r5 true;
    is.neq r1 r2 into r6;
    assert.eq r6 true;
    async configure self.caller r0 r1 r2 into r7;
    output r7 as passmeet_subs_v3_7788.aleo/configure.future;

finalize configure:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as field.public;
    input r3 as field.public;
    get.or_use admin[0u8] r0 into r4;
    is.eq r4 r0 into r5;
    assert.eq r5 true;
    set r0 into admin[0u8];
    set r1 into treasury[0u8];
    set r2 into token_ids[0u8];
    set r3 into token_ids[1u8];

function subscribe_with_credits:
    input r0 as u8.public;
    input r1 as address.public;
    input r2 as u64.public;
    input r3 as credits.aleo/credits.record;
    is.eq r0 1u8 into r4;
    is.eq r0 2u8 into r5;
    or r4 r5 into r6;
    assert.eq r6 true;
    is.eq r3.owner self.signer into r7;
    assert.eq r7 true;
    gt r2 0u64 into r8;
    assert.eq r8 true;
    ternary r4 500000u64 1000000u64 into r9;
    is.eq r2 r9 into r10;
    assert.eq r10 true;
    gte r3.microcredits r2 into r11;
    assert.eq r11 true;
    call credits.aleo/transfer_private r3 r1 r2 into r12 r13;
    async subscribe_with_credits self.signer r0 r1 r2 into r14;
    output r12 as credits.aleo/credits.record;
    output r13 as credits.aleo/credits.record;
    output r14 as passmeet_subs_v3_7788.aleo/subscribe_with_credits.future;

finalize subscribe_with_credits:
    input r0 as address.public;
    input r1 as u8.public;
    input r2 as address.public;
    input r3 as u64.public;
    get.or_use treasury[0u8] passmeet_subs_v3_7788.aleo into r4;
    is.neq r4 passmeet_subs_v3_7788.aleo into r5;
    assert.eq r5 true;
    is.eq r4 r2 into r6;
    assert.eq r6 true;
    is.eq r1 1u8 into r7;
    is.eq r1 2u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    ternary r7 259200u32 777600u32 into r10;
    ternary r7 500000u64 1000000u64 into r11;
    is.eq r3 r11 into r12;
    assert.eq r12 true;
    cast r0 0u8 0u32 0u32 into r13 as Subscription;
    get.or_use user_subs[r0] r13 into r14;
    gt r14.end_height block.height into r15;
    ternary r15 r14.end_height block.height into r16;
    add r16 r10 into r17;
    cast r0 r1 block.height r17 into r18 as Subscription;
    set r18 into user_subs[r0];

function subscribe:
    input r0 as u8.public;
    input r1 as address.public;
    input r2 as u128.public;
    input r3 as field.public;
    input r4 as token_registry.aleo/Token.record;
    is.eq r0 1u8 into r5;
    is.eq r0 2u8 into r6;
    or r5 r6 into r7;
    assert.eq r7 true;
    is.eq r4.owner self.signer into r8;
    assert.eq r8 true;
    is.eq r4.token_id r3 into r9;
    assert.eq r9 true;
    gt r2 0u128 into r10;
    assert.eq r10 true;
    gte r4.amount r2 into r11;
    assert.eq r11 true;
    call token_registry.aleo/transfer_private r1 r2 r4 into r12 r13 r14;
    async subscribe self.signer r0 r1 r2 r3 r14 into r15;
    output r12 as token_registry.aleo/Token.record;
    output r13 as token_registry.aleo/Token.record;
    output r15 as passmeet_subs_v3_7788.aleo/subscribe.future;

finalize subscribe:
    input r0 as address.public;
    input r1 as u8.public;
    input r2 as address.public;
    input r3 as u128.public;
    input r4 as field.public;
    input r5 as token_registry.aleo/transfer_private.future;
    await r5;
    get.or_use treasury[0u8] passmeet_subs_v3_7788.aleo into r6;
    is.neq r6 passmeet_subs_v3_7788.aleo into r7;
    assert.eq r7 true;
    is.eq r6 r2 into r8;
    assert.eq r8 true;
    get.or_use token_ids[0u8] 0field into r9;
    get.or_use token_ids[1u8] 0field into r10;
    is.neq r9 0field into r11;
    assert.eq r11 true;
    is.neq r10 0field into r12;
    assert.eq r12 true;
    is.eq r1 1u8 into r13;
    is.eq r1 2u8 into r14;
    or r13 r14 into r15;
    assert.eq r15 true;
    is.eq r4 r9 into r16;
    is.eq r4 r10 into r17;
    or r16 r17 into r18;
    assert.eq r18 true;
    ternary r13 259200u32 777600u32 into r19;
    ternary r13 5000000u128 10000000u128 into r20;
    ternary r16 r20 r20 into r21;
    is.eq r3 r21 into r22;
    assert.eq r22 true;
    cast r0 0u8 0u32 0u32 into r23 as Subscription;
    get.or_use user_subs[r0] r23 into r24;
    gt r24.end_height block.height into r25;
    ternary r25 r24.end_height block.height into r26;
    add r26 r19 into r27;
    cast r0 r1 block.height r27 into r28 as Subscription;
    set r28 into user_subs[r0];

constructor:
    assert.eq edition 0u16;
