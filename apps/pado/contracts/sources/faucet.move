/// Token Faucet for Pado Testnet
/// Allows anyone to get test tokens for trading
/// TreasuryCaps are stored in shared objects for public access
module pado::faucet {
    use sui::coin::{Self, TreasuryCap};
    use pado::nbtc::NBTC;
    use pado::nusdc::NUSDC;

    // Faucet amounts
    const NBTC_FAUCET_AMOUNT: u64 = 100_000_000; // 1 NBTC (8 decimals)
    const NUSDC_FAUCET_AMOUNT: u64 = 100_000_000_000; // 100,000 NUSDC (6 decimals)

    /// Shared faucet holding TreasuryCaps
    public struct TokenFaucet has key {
        id: UID,
        nbtc_cap: TreasuryCap<NBTC>,
        nusdc_cap: TreasuryCap<NUSDC>,
    }

    /// Create the shared faucet (one-time setup by TreasuryCap owner)
    public entry fun create_faucet(
        nbtc_cap: TreasuryCap<NBTC>,
        nusdc_cap: TreasuryCap<NUSDC>,
        ctx: &mut TxContext
    ) {
        let faucet = TokenFaucet {
            id: object::new(ctx),
            nbtc_cap,
            nusdc_cap,
        };
        transfer::share_object(faucet);
    }

    /// Request test tokens (anyone can call)
    public entry fun request_tokens(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Mint NBTC
        let nbtc_coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nbtc_coin, sender);

        // Mint NUSDC
        let nusdc_coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nusdc_coin, sender);
    }

    /// Request only NBTC
    public entry fun request_nbtc(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request only NUSDC
    public entry fun request_nusdc(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }
}
