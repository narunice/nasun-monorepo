/// Core SmartAccount module for the Nasun Smart Account (NSA) system.
/// Separates account identity (SmartAccount object) from keys (signers),
/// enabling multi-path authentication and key rotation without asset migration.
module nasun_smart_account::smart_account {
    use sui::bag::{Self, Bag};
    use sui::balance::Balance;
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use sui::vec_map::{Self, VecMap};
    use std::type_name;

    // === Error Codes ===

    const ENotAuthorized: u64 = 0;
    const ESignerAlreadyExists: u64 = 1;
    const ESignerNotFound: u64 = 2;
    const EInvalidThreshold: u64 = 3;
    const EMaxSignersReached: u64 = 4;
    const ECannotRemoveLastSigner: u64 = 5;
    const EInvalidSignerType: u64 = 6;
    const EInvalidWeight: u64 = 7;
    const EInsufficientBalance: u64 = 8;
    const EGuardianOverlapsWithSigner: u64 = 9;
    const EInvalidGuardianThreshold: u64 = 10;
    const EMaxGuardiansReached: u64 = 11;

    // === Constants ===

    const MAX_SIGNERS: u64 = 5;
    const MAX_GUARDIANS: u64 = 5;
    const MAX_WEIGHT: u8 = 10;
    const SIGNER_TYPE_MAX: u8 = 3;

    // === Structs ===

    public struct SmartAccount has key {
        id: UID,
        signers: VecMap<address, SignerInfo>,
        threshold: u8,
        guardians: vector<address>,
        guardian_threshold: u8,
        recovery_owner: address,
        nonce: u64,
        assets: Bag,
        created_at: u64,
    }

    public struct SignerInfo has store, drop, copy {
        signer_type: u8,
        weight: u8,
        added_at: u64,
        label: vector<u8>,
    }

    // === Events ===

    public struct AccountCreated has copy, drop {
        account_id: ID,
        creator: address,
        initial_signer: address,
        signer_type: u8,
        timestamp: u64,
    }

    public struct SignerAdded has copy, drop {
        account_id: ID,
        signer_address: address,
        signer_type: u8,
        weight: u8,
        added_by: address,
        timestamp: u64,
    }

    public struct SignerRemoved has copy, drop {
        account_id: ID,
        signer_address: address,
        removed_by: address,
        timestamp: u64,
    }

    public struct ThresholdUpdated has copy, drop {
        account_id: ID,
        old_threshold: u8,
        new_threshold: u8,
        updated_by: address,
        timestamp: u64,
    }

    public struct GuardiansUpdated has copy, drop {
        account_id: ID,
        guardians: vector<address>,
        guardian_threshold: u8,
        recovery_owner: address,
        updated_by: address,
        timestamp: u64,
    }

    public struct Deposited has copy, drop {
        account_id: ID,
        depositor: address,
        amount: u64,
        timestamp: u64,
    }

    public struct Withdrawn has copy, drop {
        account_id: ID,
        withdrawer: address,
        recipient: address,
        amount: u64,
        timestamp: u64,
    }

    // === Public Entry Functions ===

    public entry fun create_account(
        initial_signer_type: u8,
        label: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(initial_signer_type <= SIGNER_TYPE_MAX, EInvalidSignerType);

        let sender = ctx.sender();
        let now = clock.timestamp_ms();

        let mut signers = vec_map::empty<address, SignerInfo>();
        signers.insert(sender, SignerInfo {
            signer_type: initial_signer_type,
            weight: 1,
            added_at: now,
            label,
        });

        let account = SmartAccount {
            id: object::new(ctx),
            signers,
            threshold: 1,
            guardians: vector[],
            guardian_threshold: 0,
            recovery_owner: @0x0,
            nonce: 0,
            assets: bag::new(ctx),
            created_at: now,
        };

        let account_id = object::id(&account);

        event::emit(AccountCreated {
            account_id,
            creator: sender,
            initial_signer: sender,
            signer_type: initial_signer_type,
            timestamp: now,
        });

        transfer::share_object(account);
    }

    public entry fun deposit<T>(
        account: &mut SmartAccount,
        coin: Coin<T>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let amount = coin.value();
        let coin_balance = coin::into_balance(coin);
        let key = type_name::get<T>();

        if (account.assets.contains(key)) {
            let existing: &mut Balance<T> = account.assets.borrow_mut(key);
            existing.join(coin_balance);
        } else {
            account.assets.add(key, coin_balance);
        };

        event::emit(Deposited {
            account_id: object::id(account),
            depositor: ctx.sender(),
            amount,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun withdraw<T>(
        account: &mut SmartAccount,
        amount: u64,
        recipient: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert_is_signer(account, sender);

        let key = type_name::get<T>();
        assert!(account.assets.contains(key), EInsufficientBalance);

        let existing: &mut Balance<T> = account.assets.borrow_mut(key);
        assert!(existing.value() >= amount, EInsufficientBalance);

        let withdrawn = existing.split(amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, recipient);

        event::emit(Withdrawn {
            account_id: object::id(account),
            withdrawer: sender,
            recipient,
            amount,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun add_signer(
        account: &mut SmartAccount,
        new_signer: address,
        signer_type: u8,
        weight: u8,
        label: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert_is_signer(account, sender);
        assert!(signer_type <= SIGNER_TYPE_MAX, EInvalidSignerType);
        assert!(weight > 0 && weight <= MAX_WEIGHT, EInvalidWeight);
        assert!(!account.signers.contains(&new_signer), ESignerAlreadyExists);
        assert!((account.signers.length() as u64) < MAX_SIGNERS, EMaxSignersReached);
        assert!(!account.guardians.contains(&new_signer), EGuardianOverlapsWithSigner);

        let now = clock.timestamp_ms();

        account.signers.insert(new_signer, SignerInfo {
            signer_type,
            weight,
            added_at: now,
            label,
        });

        event::emit(SignerAdded {
            account_id: object::id(account),
            signer_address: new_signer,
            signer_type,
            weight,
            added_by: sender,
            timestamp: now,
        });
    }

    public entry fun remove_signer(
        account: &mut SmartAccount,
        signer_to_remove: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert_is_signer(account, sender);
        assert!(account.signers.contains(&signer_to_remove), ESignerNotFound);
        assert!(account.signers.length() > 1, ECannotRemoveLastSigner);

        account.signers.remove(&signer_to_remove);

        let total_weight = compute_total_weight(account);
        if (account.threshold > total_weight) {
            account.threshold = total_weight;
        };

        event::emit(SignerRemoved {
            account_id: object::id(account),
            signer_address: signer_to_remove,
            removed_by: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun set_guardians(
        account: &mut SmartAccount,
        guardians: vector<address>,
        guardian_threshold: u8,
        recovery_owner: address,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert_is_signer(account, sender);

        let guardian_count = guardians.length();
        assert!(guardian_count <= MAX_GUARDIANS, EMaxGuardiansReached);

        if (guardian_count > 0) {
            assert!(
                (guardian_threshold as u64) >= 2 && (guardian_threshold as u64) <= guardian_count,
                EInvalidGuardianThreshold,
            );
        } else {
            assert!(guardian_threshold == 0, EInvalidGuardianThreshold);
        };

        let mut i = 0;
        while (i < guardian_count) {
            let guardian = guardians[i];
            assert!(!account.signers.contains(&guardian), EGuardianOverlapsWithSigner);
            i = i + 1;
        };

        account.guardians = guardians;
        account.guardian_threshold = guardian_threshold;
        account.recovery_owner = recovery_owner;

        event::emit(GuardiansUpdated {
            account_id: object::id(account),
            guardians: account.guardians,
            guardian_threshold,
            recovery_owner,
            updated_by: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    public entry fun update_threshold(
        account: &mut SmartAccount,
        new_threshold: u8,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert_is_signer(account, sender);

        let total_weight = compute_total_weight(account);
        assert!(new_threshold > 0 && new_threshold <= total_weight, EInvalidThreshold);

        let old_threshold = account.threshold;
        account.threshold = new_threshold;

        event::emit(ThresholdUpdated {
            account_id: object::id(account),
            old_threshold,
            new_threshold,
            updated_by: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // === View Functions ===

    public fun is_signer(account: &SmartAccount, addr: address): bool {
        account.signers.contains(&addr)
    }

    public fun is_guardian(account: &SmartAccount, addr: address): bool {
        account.guardians.contains(&addr)
    }

    public fun get_balance<T>(account: &SmartAccount): u64 {
        let key = type_name::get<T>();
        if (account.assets.contains(key)) {
            let bal: &Balance<T> = account.assets.borrow(key);
            bal.value()
        } else {
            0
        }
    }

    public fun get_nonce(account: &SmartAccount): u64 { account.nonce }
    public fun signer_count(account: &SmartAccount): u64 { account.signers.length() as u64 }
    public fun get_threshold(account: &SmartAccount): u8 { account.threshold }
    public fun get_guardians(account: &SmartAccount): vector<address> { account.guardians }
    public fun get_guardian_threshold(account: &SmartAccount): u8 { account.guardian_threshold }
    public fun get_recovery_owner(account: &SmartAccount): address { account.recovery_owner }
    public fun get_id(account: &SmartAccount): ID { object::id(account) }
    public fun get_created_at(account: &SmartAccount): u64 { account.created_at }

    // === Package Functions (for recovery module) ===

    public(package) fun rotate_signers(
        account: &mut SmartAccount,
        new_owner: address,
        signer_type: u8,
        clock: &Clock,
    ) {
        let now = clock.timestamp_ms();

        while (account.signers.length() > 0) {
            account.signers.pop();
        };

        account.signers.insert(new_owner, SignerInfo {
            signer_type,
            weight: 1,
            added_at: now,
            label: b"recovered",
        });

        account.threshold = 1;
        account.nonce = account.nonce + 1;
    }

    // === Internal Functions ===

    fun assert_is_signer(account: &SmartAccount, addr: address) {
        assert!(account.signers.contains(&addr), ENotAuthorized);
    }

    fun compute_total_weight(account: &SmartAccount): u8 {
        let size = account.signers.length();
        let mut total: u8 = 0;
        let mut i: u64 = 0;
        while (i < (size as u64)) {
            let (_, info) = account.signers.get_entry_by_idx(i);
            total = total + info.weight;
            i = i + 1;
        };
        total
    }

    // === Test Helpers ===

    #[test_only]
    public fun create_for_testing(
        initial_signer: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SmartAccount {
        let now = clock.timestamp_ms();
        let mut signers = vec_map::empty<address, SignerInfo>();
        signers.insert(initial_signer, SignerInfo {
            signer_type: 0,
            weight: 1,
            added_at: now,
            label: b"test",
        });

        SmartAccount {
            id: object::new(ctx),
            signers,
            threshold: 1,
            guardians: vector[],
            guardian_threshold: 0,
            recovery_owner: @0x0,
            nonce: 0,
            assets: bag::new(ctx),
            created_at: now,
        }
    }

    #[test_only]
    public fun destroy_for_testing(account: SmartAccount) {
        let SmartAccount {
            id,
            signers: _,
            threshold: _,
            guardians: _,
            guardian_threshold: _,
            recovery_owner: _,
            nonce: _,
            assets,
            created_at: _,
        } = account;
        object::delete(id);
        bag::destroy_empty(assets);
    }
}
