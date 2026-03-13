// PassMeet Subscription Contract - Production Hardened
// NO Mapping::get in transitions (Shield-compatible). All reads in finalize.

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

    mapping admin: u8 => address;
    mapping treasury: u8 => address;
    mapping token_ids: u8 => field;

    const PRO_TIER: u8 = 1u8;
    const ENT_TIER: u8 = 2u8;

    const PRO_DURATION_BLOCKS: u32 = 259_200u32;
    const ENT_DURATION_BLOCKS: u32 = 777_600u32;

    const PRO_PRICE_CREDITS: u128 = 500_000u128;
    const ENT_PRICE_CREDITS: u128 = 1_000_000u128;
    const PRO_PRICE_USDCX: u128 = 5_000_000u128;
    const ENT_PRICE_USDCX: u128 = 10_000_000u128;
    const PRO_PRICE_USAD: u128 = 5_000_000u128;
    const ENT_PRICE_USAD: u128 = 10_000_000u128;

    @noupgrade
    async constructor() {}

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

    // Atomic paid subscribe (credits). Treasury and price passed as public; finalize verifies.
    async transition subscribe_with_credits(
        public tier: u8,
        public treasury_address: address,
        public price: u64,
        payment_record: credits.aleo/credits
    ) -> (credits.aleo/credits, credits.aleo/credits, Future) {
        assert(tier == PRO_TIER || tier == ENT_TIER);
        assert(payment_record.owner == self.caller);
        assert(price > 0u64);
        assert(payment_record.microcredits >= price);

        let (to_treasury, change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(payment_record, treasury_address, price);

        return (to_treasury, change, finalize_set_subscription_credits(self.caller, tier, treasury_address, price));
    }

    async function finalize_set_subscription_credits(
        public user: address,
        public tier: u8,
        public treasury_address: address,
        public price: u64
    ) {
        let stored_treasury: address = Mapping::get_or_use(treasury, 0u8, self.address);
        assert(stored_treasury == treasury_address);
        assert(price == (PRO_PRICE_CREDITS as u64) || price == (ENT_PRICE_CREDITS as u64));

        let duration_blocks: u32 = 0u32;
        if (tier == PRO_TIER) {
            duration_blocks = PRO_DURATION_BLOCKS;
        } else {
            duration_blocks = ENT_DURATION_BLOCKS;
        }

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

    // Atomic paid subscribe (token_registry). Treasury and expected_amount passed as public; finalize verifies.
    async transition subscribe(
        public tier: u8,
        public treasury_address: address,
        public expected_amount: u128,
        payment_record: token_registry.aleo/Token
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(tier == PRO_TIER || tier == ENT_TIER);
        assert(payment_record.owner == self.caller);
        assert(expected_amount > 0u128);
        assert(payment_record.amount >= expected_amount);

        let (change, to_treasury, transfer_future): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(treasury_address, expected_amount, payment_record);

        return (change, to_treasury, finalize_subscribe_token(self.caller, tier, treasury_address, expected_amount, transfer_future));
    }

    async function finalize_subscribe_token(
        public user: address,
        public tier: u8,
        public treasury_address: address,
        public expected_amount: u128,
        transfer_future: Future
    ) {
        await transfer_future;

        let stored_treasury: address = Mapping::get_or_use(treasury, 0u8, self.address);
        assert(stored_treasury == treasury_address);
        assert(expected_amount == PRO_PRICE_USDCX || expected_amount == ENT_PRICE_USDCX || expected_amount == PRO_PRICE_USAD || expected_amount == ENT_PRICE_USAD);

        let duration_blocks: u32 = 0u32;
        if (tier == PRO_TIER) {
            duration_blocks = PRO_DURATION_BLOCKS;
        } else {
            duration_blocks = ENT_DURATION_BLOCKS;
        }

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
