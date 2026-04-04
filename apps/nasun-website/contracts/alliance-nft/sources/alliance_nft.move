/// AllianceNFT - Nasun Alliance collectible NFTs
///
/// Server-side minted NFTs for nasun-website Alliance feature.
/// Admin-gated minting via Lambda, one per user account.
///
/// Flow: User selects image -> Lambda mints via admin key -> NFT transferred to user wallet
module alliance_nft::alliance_nft {
    use sui::clock::Clock;
    use sui::display;
    use sui::event;
    use sui::package;

    // ========== Error Codes ==========
    const E_INVALID_IMAGE_INDEX: u64 = 100;
    const E_MAX_SUPPLY_REACHED: u64 = 101;

    // ========== Constants ==========
    const MAX_IMAGE_INDEX: u64 = 3;
    const DEFAULT_MAX_SUPPLY: u64 = 20000;

    // ========== OTW ==========

    public struct ALLIANCE_NFT has drop {}

    // ========== Structs ==========

    /// Admin capability for minting. Transferred to deployer at publish.
    public struct AllianceAdmin has key, store {
        id: UID,
    }

    /// Shared registry tracking mint count and supply cap.
    public struct AllianceRegistry has key {
        id: UID,
        total_minted: u64,
        max_supply: u64,
    }

    /// The NFT itself. Owned by the recipient, transferable.
    public struct AllianceNFT has key, store {
        id: UID,
        serial_number: u64,
        description: std::string::String,
        image_url: std::string::String,
        image_index: u64,
        minted_at: u64,
        recipient: address,
    }

    // ========== Events ==========

    public struct AllianceMinted has copy, drop {
        nft_id: address,
        recipient: address,
        image_index: u64,
        serial_number: u64,
    }

    // ========== Init (OTW, runs once at publish) ==========

    fun init(otw: ALLIANCE_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        // Display: wallet/explorer renders NFT metadata via these templates
        let mut nft_display = display::new<AllianceNFT>(&publisher, ctx);
        nft_display.add(b"name".to_string(), b"Nasun Alliance #{serial_number}".to_string());
        nft_display.add(b"image_url".to_string(), b"{image_url}".to_string());
        nft_display.add(b"description".to_string(), b"{description}".to_string());
        nft_display.add(b"project_url".to_string(), b"https://nasun.io".to_string());
        display::update_version(&mut nft_display);

        let admin = AllianceAdmin { id: object::new(ctx) };
        let registry = AllianceRegistry {
            id: object::new(ctx),
            total_minted: 0,
            max_supply: DEFAULT_MAX_SUPPLY,
        };

        transfer::public_transfer(publisher, ctx.sender());
        transfer::public_transfer(nft_display, ctx.sender());
        transfer::transfer(admin, ctx.sender());
        transfer::share_object(registry);
    }

    // ========== Mint ==========

    /// Mint a new AllianceNFT. Admin-gated, called by Lambda.
    /// serial_number is auto-assigned from registry.total_minted + 1.
    public fun mint(
        _admin: &AllianceAdmin,
        registry: &mut AllianceRegistry,
        recipient: address,
        description: std::string::String,
        image_url: std::string::String,
        image_index: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(image_index <= MAX_IMAGE_INDEX, E_INVALID_IMAGE_INDEX);
        assert!(registry.total_minted < registry.max_supply, E_MAX_SUPPLY_REACHED);

        registry.total_minted = registry.total_minted + 1;
        let serial = registry.total_minted;

        let nft = AllianceNFT {
            id: object::new(ctx),
            serial_number: serial,
            description,
            image_url,
            image_index,
            minted_at: clock.timestamp_ms(),
            recipient,
        };

        let nft_id = object::uid_to_address(&nft.id);

        event::emit(AllianceMinted {
            nft_id,
            recipient,
            image_index,
            serial_number: serial,
        });

        transfer::transfer(nft, recipient);
    }

    // ========== Admin Restore (devnet reset recovery) ==========

    /// Restore an AllianceNFT after devnet reset. Preserves original fields.
    /// Called by restore-nfts.ts script with snapshot data.
    public fun admin_restore(
        _admin: &AllianceAdmin,
        registry: &mut AllianceRegistry,
        recipient: address,
        description: std::string::String,
        image_url: std::string::String,
        image_index: u64,
        serial_number: u64,
        minted_at: u64,
        ctx: &mut TxContext,
    ) {
        assert!(image_index <= MAX_IMAGE_INDEX, E_INVALID_IMAGE_INDEX);
        assert!(registry.total_minted < registry.max_supply, E_MAX_SUPPLY_REACHED);

        registry.total_minted = registry.total_minted + 1;

        let nft = AllianceNFT {
            id: object::new(ctx),
            serial_number,
            description,
            image_url,
            image_index,
            minted_at,
            recipient,
        };

        let nft_id = object::uid_to_address(&nft.id);

        event::emit(AllianceMinted {
            nft_id,
            recipient,
            image_index,
            serial_number,
        });

        transfer::transfer(nft, recipient);
    }

    // ========== Admin Functions ==========

    /// Update the max supply cap. Admin-gated.
    public fun update_max_supply(
        _admin: &AllianceAdmin,
        registry: &mut AllianceRegistry,
        new_max_supply: u64,
    ) {
        registry.max_supply = new_max_supply;
    }

    // ========== View Functions ==========

    public fun get_serial_number(nft: &AllianceNFT): u64 { nft.serial_number }
    public fun get_image_index(nft: &AllianceNFT): u64 { nft.image_index }
    public fun get_minted_at(nft: &AllianceNFT): u64 { nft.minted_at }
    public fun get_recipient(nft: &AllianceNFT): address { nft.recipient }
    public fun get_total_minted(registry: &AllianceRegistry): u64 { registry.total_minted }
    public fun get_max_supply(registry: &AllianceRegistry): u64 { registry.max_supply }
}
