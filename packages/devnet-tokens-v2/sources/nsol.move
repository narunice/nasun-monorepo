/// NSOL - Nasun Network Test SOL
/// 9 decimals (same as real SOL)
module devnet_tokens_v2::nsol {
    use sui::coin::{Self, TreasuryCap};

    /// OTW for NSOL token
    public struct NSOL has drop {}

    /// Initialize the NSOL currency
    #[allow(deprecated_usage)]
    fun init(witness: NSOL, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NSOL>(
            witness,
            9,                              // decimals (Solana standard)
            b"NSOL",                        // symbol
            b"Nasun SOL",                   // name
            b"Nasun Network Test SOL",      // description
            option::none(),                 // icon_url
            ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Mint NSOL tokens (only TreasuryCap holder can call)
    public fun mint(
        treasury_cap: &mut TreasuryCap<NSOL>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
