// PassMeet Subscription Contract - Production Hardened
// Tier pricing per rail, atomic paid subscribe flows, on-chain validity via block.height.

import credits.aleo;
import token_registry.aleo;

program passmeet_subs_7788.aleo {
    struct Subscription {
        subscriber: address,
        tier: u8,
        start_height: u32,
        end_height: u32
    }

    mapping user_subs: address => Subscription;

    // Config (set once by admin)
    mapping admin: u8 => address;
    mapping treasury: u8 => address;
    // token_ids[0] = USDCx, token_ids[1] = USAD. 0field means unset.
    mapping token_ids: u8 => field;

    const PRO_TIER: u8 = 1u8;
    const ENT_TIER: u8 = 2u8;

    // Durations are expressed in blocks.
    const PRO_DURATION_BLOCKS: u32 = 259_200u32; // ~30 days (approx; depends on block time)
    const ENT_DURATION_BLOCKS: u32 = 777_600u32; // ~90 days (approx; depends on block time)

    // Prices are micro-units with 6 decimals (credits microcredits; tokens typically use 6 decimals too).
    const PRO_PRICE_CREDITS: u128 = 500_000u128; // 0.5 Aleo credits
    const ENT_PRICE_CREDITS: u128 = 1_000_000u128; // 1.0 Aleo credits
    const PRO_PRICE_USDCX: u128 = 5_000_000u128; // 5 USDCx
    const ENT_PRICE_USDCX: u128 = 10_000_000u128; // 10 USDCx
    const PRO_PRICE_USAD: u128 = 5_000_000u128; // 5 USAD
    const ENT_PRICE_USAD: u128 = 10_000_000u128; // 10 USAD

    @noupgrade
    async constructor() {}

    // One-time (or admin-only) config for payments recipient and token IDs.
    async transition configure(
        public treasury_address: address,
        public usdcx_token_id: field,
        public usad_token_id: field
    ) -> Future {
        assert(treasury_address != self.address);
        assert(usdcx_token_id != 0field);
        assert(usad_token_id != 0field);
        assert(usdcx_token_id != usad_token_id);
        return finalize_configure(self.caller, treasury_address, usdcx_token_id, usad_token_id);
    }

    async function finalize_configure(
        public caller: address,
        public treasury_address: address,
        public usdcx_token_id: field,
        public usad_token_id: field
    ) {
        let current_admin: address = Mapping::get_or_use(admin, 0u8, caller);
        assert(current_admin == caller);
        Mapping::set(admin, 0u8, caller);
        Mapping::set(treasury, 0u8, treasury_address);
        Mapping::set(token_ids, 0u8, usdcx_token_id);
        Mapping::set(token_ids, 1u8, usad_token_id);
    }

    // Atomic paid subscribe (credits.aleo).
    async transition subscribe_with_credits(
        public tier: u8,
        payment_record: credits.aleo/credits
    ) -> (credits.aleo/credits, credits.aleo/credits, Future) {
        assert(tier == PRO_TIER || tier == ENT_TIER);
        assert(payment_record.owner == self.caller);

        let treasury_address: address = Mapping::get_or_use(treasury, 0u8, self.address);
        assert(treasury_address != self.address);

        let duration_blocks: u32 = 0u32;
        let price_u128: u128 = 0u128;
        if (tier == PRO_TIER) {
            duration_blocks = PRO_DURATION_BLOCKS;
            price_u128 = PRO_PRICE_CREDITS;
        } else {
            duration_blocks = ENT_DURATION_BLOCKS;
            price_u128 = ENT_PRICE_CREDITS;
        }
        assert(price_u128 > 0u128);

        // credits.aleo uses u64 microcredits
        assert(price_u128 <= 18_446_744_073_709_551_615u128);
        let price_u64: u64 = price_u128 as u64;
        assert(payment_record.microcredits >= price_u64);

        let (to_treasury, change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(payment_record, treasury_address, price_u64);

        return (to_treasury, change, finalize_set_subscription(self.caller, tier, duration_blocks));
    }

    // Atomic paid subscribe (token_registry). Supports USDCx and USAD based on configured token IDs.
    async transition subscribe(
        public tier: u8,
        payment_record: token_registry.aleo/Token
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(tier == PRO_TIER || tier == ENT_TIER);
        assert(payment_record.owner == self.caller);

        let treasury_address: address = Mapping::get_or_use(treasury, 0u8, self.address);
        assert(treasury_address != self.address);

        let usdcx_id: field = Mapping::get_or_use(token_ids, 0u8, 0field);
        let usad_id: field = Mapping::get_or_use(token_ids, 1u8, 0field);
        assert(usdcx_id != 0field);
        assert(usad_id != 0field);

        let duration_blocks: u32 = 0u32;
        if (tier == PRO_TIER) {
            duration_blocks = PRO_DURATION_BLOCKS;
        } else {
            duration_blocks = ENT_DURATION_BLOCKS;
        }

        let expected_amount: u128 = 0u128;
        if (payment_record.token_id == usdcx_id) {
            if (tier == PRO_TIER) {
                expected_amount = PRO_PRICE_USDCX;
            } else {
                expected_amount = ENT_PRICE_USDCX;
            }
        } else {
            if (payment_record.token_id == usad_id) {
                if (tier == PRO_TIER) {
                    expected_amount = PRO_PRICE_USAD;
                } else {
                    expected_amount = ENT_PRICE_USAD;
                }
            } else {
                assert(false);
            }
        }

        assert(expected_amount > 0u128);
        assert(payment_record.amount >= expected_amount);

        let (change, to_treasury, transfer_future): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(treasury_address, expected_amount, payment_record);

        return (change, to_treasury, finalize_subscribe_token(self.caller, tier, duration_blocks, transfer_future));
    }

    async function finalize_subscribe_token(
        public user: address,
        public tier: u8,
        public duration_blocks: u32,
        transfer_future: Future
    ) {
        await transfer_future;
        finalize_set_subscription(user, tier, duration_blocks);
    }

    async function finalize_set_subscription(
        public user: address,
        public tier: u8,
        public duration_blocks: u32
    ) {
        let current_sub: Subscription = Mapping::get_or_use(user_subs, user, Subscription {
            subscriber: user,
            tier: 0u8,
            start_height: 0u32,
            end_height: 0u32
        });

        let base_height: u32 = block.height;
        if (current_sub.end_height > block.height) {
            base_height = current_sub.end_height;
        }

        let new_end: u32 = base_height + duration_blocks;
        let updated_sub: Subscription = Subscription {
            subscriber: user,
            tier: tier,
            start_height: block.height,
            end_height: new_end
        };

        Mapping::set(user_subs, user, updated_sub);
    }
}
