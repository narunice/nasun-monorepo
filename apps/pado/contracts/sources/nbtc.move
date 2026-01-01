/// NBTC - Nasun Network Test BTC
/// 8 decimals (same as real BTC)
/// Max supply: 21 million (like real BTC)
module pado::nbtc {
    use sui::coin::{Self, TreasuryCap};

    // Max supply: 21 million NBTC with 8 decimals
    const MAX_SUPPLY: u64 = 21_000_000_00000000; // 21M * 10^8

    // Error codes
    const E_MAX_SUPPLY_REACHED: u64 = 1;

    /// OTW for NBTC token
    public struct NBTC has drop {}

    /// Initialize the NBTC currency
    fun init(witness: NBTC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NBTC>(
            witness,
            8,                              // decimals
            b"NBTC",                        // symbol
            b"Nasun BTC",                   // name
            b"Nasun Network Test BTC",      // description
            option::none(),                 // icon_url
            ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Mint NBTC tokens (only TreasuryCap holder can call)
    /// Enforces MAX_SUPPLY limit of 21 million NBTC
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<NBTC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        // Security: Check max supply limit
        let current_supply = coin::total_supply(treasury_cap);
        assert!(current_supply + amount <= MAX_SUPPLY, E_MAX_SUPPLY_REACHED);

        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Get remaining mintable supply
    public fun remaining_supply(treasury_cap: &TreasuryCap<NBTC>): u64 {
        let current = coin::total_supply(treasury_cap);
        if (current >= MAX_SUPPLY) {
            0
        } else {
            MAX_SUPPLY - current
        }
    }

    /// Get max supply constant
    public fun max_supply(): u64 {
        MAX_SUPPLY
    }
}
