/// NETH - Nasun Network Test ETH
/// 18 decimals (same as real ETH)
module devnet_tokens_v2::neth {
    use sui::coin::{Self, TreasuryCap};

    /// OTW for NETH token
    public struct NETH has drop {}

    /// Initialize the NETH currency
    #[allow(deprecated_usage)]
    fun init(witness: NETH, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NETH>(
            witness,
            18,                             // decimals (Ethereum standard)
            b"NETH",                        // symbol
            b"Nasun ETH",                   // name
            b"Nasun Network Test ETH",      // description
            option::none(),                 // icon_url
            ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    /// Mint NETH tokens (only TreasuryCap holder can call)
    public fun mint(
        treasury_cap: &mut TreasuryCap<NETH>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
