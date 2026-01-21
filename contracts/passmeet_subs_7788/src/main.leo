program passmeet_subs_7788.aleo {
    struct Subscription {
        subscriber: address,
        expiry: u32,
        tier: u8
    }

    mapping user_subs: address => Subscription;

    @noupgrade
    async constructor() {}

    async transition subscribe(
        public tier: u8,
        public duration: u32
    ) -> Future {
        return finalize_subscribe(self.caller, tier, duration);
    }

    async function finalize_subscribe(
        public user: address,
        public tier: u8,
        public duration: u32
    ) {
        let current_sub: Subscription = Mapping::get_or_use(user_subs, user, Subscription {
            subscriber: user,
            expiry: 0u32,
            tier: 0u8
        });

        let new_expiry: u32 = current_sub.expiry + duration;
        
        let updated_sub: Subscription = Subscription {
            subscriber: user,
            expiry: new_expiry,
            tier: tier
        };

        Mapping::set(user_subs, user, updated_sub);
    }
}
