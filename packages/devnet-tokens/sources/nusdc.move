/// NUSDC - Nasun Network Test USDC
/// 6 decimals (same as real USDC)
///
/// This is the unified test USDC token for all Nasun Devnet apps.
/// All apps (pado, baram, etc.) should use this token type.
module devnet_tokens::nusdc {
    use sui::coin::{Self, TreasuryCap};

    /// OTW for NUSDC token
    public struct NUSDC has drop {}

    /// Initialize the NUSDC currency
    #[allow(deprecated_usage)]
    fun init(witness: NUSDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NUSDC>(
            witness,
            6,                              // decimals
            b"NUSDC",                       // symbol
            b"Nasun USDC",                  // name
            b"Nasun Network Test USDC",     // description
            option::none(),                 // icon_url
            ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Mint NUSDC tokens (only TreasuryCap holder can call)
    public fun mint(
        treasury_cap: &mut TreasuryCap<NUSDC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
