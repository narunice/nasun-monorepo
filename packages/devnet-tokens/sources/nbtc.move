/// NBTC - Nasun Network Test BTC
/// 8 decimals (same as real BTC)
///
/// This is the unified test BTC token for all Nasun Devnet apps.
/// All apps (pado, baram, etc.) should use this token type.
module devnet_tokens::nbtc {
    use sui::coin::{Self, TreasuryCap};

    /// OTW for NBTC token
    public struct NBTC has drop {}

    /// Initialize the NBTC currency
    #[allow(deprecated_usage)]
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
    public fun mint(
        treasury_cap: &mut TreasuryCap<NBTC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
