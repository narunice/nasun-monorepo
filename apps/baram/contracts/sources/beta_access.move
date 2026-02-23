/// BetaAccessNFT - Gated Access for Baram Beta Testers
///
/// Enables admin to mint NFTs that grant beta access to the Baram chat.
/// Part of the Baram AI Settlement Layer.
///
/// Flow: Admin mints NFT -> Transfer to tester -> Frontend checks ownership
///
/// Access constraints:
/// - expires_at: Time-limited access (0 = no expiry)
/// - remaining_uses: Usage-limited access (0 = unlimited)
module baram::beta_access {
    use sui::clock::Clock;
    use sui::event;
    use sui::package::UpgradeCap;

    // ========== Error Codes ==========
    const E_INVALID_EXPIRY: u64 = 200;
    const E_NFT_EXPIRED: u64 = 201;
    const E_NO_REMAINING_USES: u64 = 202;
    const E_BATCH_TOO_LARGE: u64 = 203;

    // ========== Constants ==========
    const MAX_BATCH_SIZE: u64 = 100;

    // ========== Structs ==========

    /// Admin capability for beta access management.
    /// Created via initialize(), transferred to caller.
    public struct BetaAccessAdmin has key, store {
        id: UID,
    }

    /// Shared registry for tracking mint stats
    public struct BetaAccessRegistry has key {
        id: UID,
        total_minted: u64,
    }

    /// BetaAccessNFT — Gating token for beta testers
    public struct BetaAccessNFT has key, store {
        id: UID,
        issued_at: u64,
        expires_at: u64,      // 0 = no expiry
        remaining_uses: u64,  // 0 = unlimited
        original_uses: u64,   // For display purposes
        recipient: address,   // Original recipient
    }

    // ========== Events ==========

    public struct BetaAccessInitialized has copy, drop {
        registry_id: address,
        admin_id: address,
        admin_holder: address,
    }

    public struct BetaAccessMinted has copy, drop {
        nft_id: address,
        recipient: address,
        expires_at: u64,
        remaining_uses: u64,
    }

    public struct BetaAccessUsed has copy, drop {
        nft_id: address,
        owner: address,
        remaining_uses: u64,
    }

    // ========== Admin Functions ==========

    /// One-time initialization after package upgrade.
    /// Creates BetaAccessAdmin (owned) and BetaAccessRegistry (shared).
    /// Requires UpgradeCap to prove caller is the package deployer.
    public entry fun initialize(_cap: &UpgradeCap, ctx: &mut TxContext) {
        let admin = BetaAccessAdmin {
            id: object::new(ctx),
        };

        let registry = BetaAccessRegistry {
            id: object::new(ctx),
            total_minted: 0,
        };

        let admin_holder = tx_context::sender(ctx);
        let admin_id = object::uid_to_address(&admin.id);
        let registry_id = object::uid_to_address(&registry.id);

        event::emit(BetaAccessInitialized {
            registry_id,
            admin_id,
            admin_holder,
        });

        transfer::share_object(registry);
        transfer::transfer(admin, admin_holder);
    }

    /// Mint a BetaAccessNFT and transfer to recipient
    public entry fun mint(
        _admin: &BetaAccessAdmin,
        registry: &mut BetaAccessRegistry,
        recipient: address,
        expires_at: u64,
        remaining_uses: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock.timestamp_ms();
        assert!(expires_at == 0 || expires_at > now, E_INVALID_EXPIRY);

        let nft = BetaAccessNFT {
            id: object::new(ctx),
            issued_at: now,
            expires_at,
            remaining_uses,
            original_uses: remaining_uses,
            recipient,
        };

        let nft_id = object::uid_to_address(&nft.id);
        registry.total_minted = registry.total_minted + 1;

        event::emit(BetaAccessMinted {
            nft_id,
            recipient,
            expires_at,
            remaining_uses,
        });

        transfer::transfer(nft, recipient);
    }

    /// Batch mint NFTs to multiple recipients with same parameters
    public entry fun batch_mint(
        _admin: &BetaAccessAdmin,
        registry: &mut BetaAccessRegistry,
        recipients: vector<address>,
        expires_at: u64,
        remaining_uses: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock.timestamp_ms();
        assert!(expires_at == 0 || expires_at > now, E_INVALID_EXPIRY);

        let len = vector::length(&recipients);
        assert!(len <= MAX_BATCH_SIZE, E_BATCH_TOO_LARGE);
        let mut i = 0;
        while (i < len) {
            let recipient = *vector::borrow(&recipients, i);

            let nft = BetaAccessNFT {
                id: object::new(ctx),
                issued_at: now,
                expires_at,
                remaining_uses,
                original_uses: remaining_uses,
                recipient,
            };

            let nft_id = object::uid_to_address(&nft.id);
            registry.total_minted = registry.total_minted + 1;

            event::emit(BetaAccessMinted {
                nft_id,
                recipient,
                expires_at,
                remaining_uses,
            });

            transfer::transfer(nft, recipient);
            i = i + 1;
        };
    }

    // ========== Usage Functions ==========

    /// Record a use of the NFT (decrements remaining_uses if limited).
    /// Returns true if the NFT is still valid after use.
    /// For future on-chain enforcement; currently frontend-only.
    public entry fun use_access(
        nft: &mut BetaAccessNFT,
        clock: &Clock,
        ctx: &TxContext
    ) {
        let now = clock.timestamp_ms();
        assert!(nft.expires_at == 0 || now < nft.expires_at, E_NFT_EXPIRED);

        // If usage-limited (original_uses > 0), enforce and decrement
        if (nft.original_uses > 0) {
            assert!(nft.remaining_uses > 0, E_NO_REMAINING_USES);
            nft.remaining_uses = nft.remaining_uses - 1;
        };
        // original_uses == 0 means unlimited, no decrement needed

        let nft_id = object::uid_to_address(&nft.id);

        event::emit(BetaAccessUsed {
            nft_id,
            owner: tx_context::sender(ctx),
            remaining_uses: nft.remaining_uses,
        });
    }

    // ========== View Functions ==========

    /// Check if NFT is currently valid (not expired, has uses remaining)
    public fun is_valid(nft: &BetaAccessNFT, clock: &Clock): bool {
        let now = clock.timestamp_ms();
        let not_expired = nft.expires_at == 0 || now < nft.expires_at;
        // remaining_uses == 0 means unlimited (always has uses)
        // remaining_uses > 0 means limited (check count)
        let has_uses = nft.original_uses == 0 || nft.remaining_uses > 0;
        not_expired && has_uses
    }

    public fun get_remaining_uses(nft: &BetaAccessNFT): u64 {
        nft.remaining_uses
    }

    public fun get_expires_at(nft: &BetaAccessNFT): u64 {
        nft.expires_at
    }

    public fun get_issued_at(nft: &BetaAccessNFT): u64 {
        nft.issued_at
    }

    public fun get_recipient(nft: &BetaAccessNFT): address {
        nft.recipient
    }

    public fun get_total_minted(registry: &BetaAccessRegistry): u64 {
        registry.total_minted
    }
}
