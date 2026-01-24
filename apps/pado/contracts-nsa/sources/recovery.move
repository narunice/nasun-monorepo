/// Guardian-based social recovery module for Nasun Smart Account.
/// Implements Sovereign Social Recovery: guardians can only rotate signers
/// to a pre-approved recovery_owner address, with a 48-hour timelock.
module nasun_smart_account::recovery {
    use sui::clock::Clock;
    use sui::event;

    use nasun_smart_account::smart_account::SmartAccount;

    // === Error Codes ===

    const ENotGuardian: u64 = 100;
    const ETimelockNotExpired: u64 = 102;
    const EAlreadyApproved: u64 = 103;
    const EInsufficientApprovals: u64 = 104;
    const ERecoveryOwnerMismatch: u64 = 105;
    const ESignerCannotInitiate: u64 = 106;
    const EAlreadyExecuted: u64 = 107;
    const EAlreadyCancelled: u64 = 108;
    const ENotAuthorizedSigner: u64 = 109;
    const EGuardiansNotConfigured: u64 = 110;
    const EAccountMismatch: u64 = 111;

    // === Constants ===

    const TIMELOCK_MS: u64 = 172_800_000; // 48 hours
    const RECOVERED_SIGNER_TYPE: u8 = 2; // LOCAL type

    // === Structs ===

    public struct RecoveryRequest has key {
        id: UID,
        account_id: ID,
        requester: address,
        new_owner: address,
        approvals: vector<address>,
        required_approvals: u8,
        timelock_end: u64,
        is_executed: bool,
        is_cancelled: bool,
        created_at: u64,
    }

    // === Events ===

    public struct RecoveryInitiated has copy, drop {
        account_id: ID,
        request_id: ID,
        requester: address,
        new_owner: address,
        required_approvals: u8,
        timelock_end: u64,
        timestamp: u64,
    }

    public struct RecoveryApproved has copy, drop {
        request_id: ID,
        approver: address,
        current_approvals: u64,
        required_approvals: u8,
        timestamp: u64,
    }

    public struct RecoveryExecuted has copy, drop {
        account_id: ID,
        request_id: ID,
        new_owner: address,
        old_signers_count: u64,
        timestamp: u64,
    }

    public struct RecoveryCancelled has copy, drop {
        request_id: ID,
        cancelled_by: address,
        timestamp: u64,
    }

    // === Public Entry Functions ===

    /// Guardian initiates a recovery request.
    public entry fun initiate_recovery(
        account: &SmartAccount,
        new_owner: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        let now = clock.timestamp_ms();

        assert!(account.is_guardian(sender), ENotGuardian);
        assert!(!account.is_signer(sender), ESignerCannotInitiate);

        let guardian_threshold = account.get_guardian_threshold();
        assert!(guardian_threshold > 0, EGuardiansNotConfigured);

        let recovery_owner = account.get_recovery_owner();
        assert!(new_owner == recovery_owner, ERecoveryOwnerMismatch);

        let account_id = account.get_id();
        let timelock_end = now + TIMELOCK_MS;

        let mut approvals = vector[];
        approvals.push_back(sender);

        let request = RecoveryRequest {
            id: object::new(ctx),
            account_id,
            requester: sender,
            new_owner,
            approvals,
            required_approvals: guardian_threshold,
            timelock_end,
            is_executed: false,
            is_cancelled: false,
            created_at: now,
        };

        let request_id = object::id(&request);

        event::emit(RecoveryInitiated {
            account_id,
            request_id,
            requester: sender,
            new_owner,
            required_approvals: guardian_threshold,
            timelock_end,
            timestamp: now,
        });

        transfer::share_object(request);
    }

    /// Guardian approves a pending recovery request.
    public entry fun approve_recovery(
        request: &mut RecoveryRequest,
        account: &SmartAccount,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        let now = clock.timestamp_ms();

        assert!(!request.is_executed, EAlreadyExecuted);
        assert!(!request.is_cancelled, EAlreadyCancelled);
        assert!(request.account_id == account.get_id(), EAccountMismatch);
        assert!(account.is_guardian(sender), ENotGuardian);
        assert!(!request.approvals.contains(&sender), EAlreadyApproved);

        request.approvals.push_back(sender);

        event::emit(RecoveryApproved {
            request_id: object::id(request),
            approver: sender,
            current_approvals: request.approvals.length(),
            required_approvals: request.required_approvals,
            timestamp: now,
        });
    }

    /// Execute recovery after timelock expires and threshold is met.
    public entry fun execute_recovery(
        request: &mut RecoveryRequest,
        account: &mut SmartAccount,
        clock: &Clock,
        _ctx: &TxContext,
    ) {
        let now = clock.timestamp_ms();

        assert!(!request.is_executed, EAlreadyExecuted);
        assert!(!request.is_cancelled, EAlreadyCancelled);
        assert!(request.account_id == account.get_id(), EAccountMismatch);
        assert!(now >= request.timelock_end, ETimelockNotExpired);
        assert!(
            request.approvals.length() >= (request.required_approvals as u64),
            EInsufficientApprovals,
        );
        assert!(request.new_owner == account.get_recovery_owner(), ERecoveryOwnerMismatch);

        let old_signers_count = account.signer_count();

        nasun_smart_account::smart_account::rotate_signers(
            account,
            request.new_owner,
            RECOVERED_SIGNER_TYPE,
            clock,
        );

        request.is_executed = true;

        event::emit(RecoveryExecuted {
            account_id: account.get_id(),
            request_id: object::id(request),
            new_owner: request.new_owner,
            old_signers_count,
            timestamp: now,
        });
    }

    /// Owner cancels a pending recovery during timelock period.
    public entry fun cancel_recovery(
        request: &mut RecoveryRequest,
        account: &SmartAccount,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();

        assert!(!request.is_executed, EAlreadyExecuted);
        assert!(!request.is_cancelled, EAlreadyCancelled);
        assert!(request.account_id == account.get_id(), EAccountMismatch);
        assert!(account.is_signer(sender), ENotAuthorizedSigner);

        request.is_cancelled = true;

        event::emit(RecoveryCancelled {
            request_id: object::id(request),
            cancelled_by: sender,
            timestamp: clock.timestamp_ms(),
        });
    }

    // === View Functions ===

    public fun is_pending(request: &RecoveryRequest): bool {
        !request.is_executed && !request.is_cancelled
    }

    public fun approval_count(request: &RecoveryRequest): u64 {
        request.approvals.length()
    }

    public fun get_timelock_end(request: &RecoveryRequest): u64 {
        request.timelock_end
    }

    public fun get_account_id(request: &RecoveryRequest): ID {
        request.account_id
    }

    public fun get_new_owner(request: &RecoveryRequest): address {
        request.new_owner
    }

    public fun is_timelock_expired(request: &RecoveryRequest, clock: &Clock): bool {
        clock.timestamp_ms() >= request.timelock_end
    }

    public fun has_sufficient_approvals(request: &RecoveryRequest): bool {
        request.approvals.length() >= (request.required_approvals as u64)
    }

    public fun has_approved(request: &RecoveryRequest, addr: address): bool {
        request.approvals.contains(&addr)
    }

    public fun timelock_duration_ms(): u64 {
        TIMELOCK_MS
    }
}
