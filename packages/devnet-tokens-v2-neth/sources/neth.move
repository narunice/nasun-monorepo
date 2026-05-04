/// NETH - Nasun Network Test ETH
/// 8 decimals (post-DeepBook FLOAT_SCALING migration; matches Sui mainnet WETH).
///
/// This package was split off from devnet-tokens-v2 because the NETH 8-decimal
/// migration produced a separate on-chain package address (0xe672...) distinct
/// from the original devnet-tokens-v2 (0xcc65...). Source identical to v2's,
/// but the [addresses] in Move.toml resolves the type identity correctly.
module devnet_tokens_v2_neth::neth {
    use sui::coin::{Self, TreasuryCap};

    /// OTW for NETH token
    public struct NETH has drop {}

    /// Initialize the NETH currency
    #[allow(deprecated_usage)]
    fun init(witness: NETH, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NETH>(
            witness,
            8,                              // decimals
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
