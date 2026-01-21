program passmeet_subs_7788.aleo;

struct Subscription:
    subscriber as address;
    expiry as u32;
    tier as u8;

mapping user_subs:
    key as address.public;
    value as Subscription.public;

function subscribe:
    input r0 as u8.public;
    input r1 as u32.public;
    async subscribe self.caller r0 r1 into r2;
    output r2 as passmeet_subs_7788.aleo/subscribe.future;

finalize subscribe:
    input r0 as address.public;
    input r1 as u8.public;
    input r2 as u32.public;
    cast r0 0u32 0u8 into r3 as Subscription;
    get.or_use user_subs[r0] r3 into r4;
    add r4.expiry r2 into r5;
    cast r0 r5 r1 into r6 as Subscription;
    set r6 into user_subs[r0];

constructor:
    assert.eq edition 0u16;
