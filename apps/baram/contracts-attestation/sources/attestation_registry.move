/// Attestation Registry - Manages trusted PCR baselines for TEE verification
///
/// Phase D-1: PCR Baseline Registry
/// - Admin can register/update trusted PCR baselines
/// - verify_pcr() function for checking attestation validity
/// - Versioned baselines with activation/deactivation
///
/// PCR values are collected from AWS Nitro Enclaves:
/// - PCR0: Enclave image hash
/// - PCR1: Linux kernel and bootstrap hash
/// - PCR2: Application hash
///
/// Future phases:
/// - COSE signature verification
/// - Certificate chain validation
module baram_attestation::attestation_registry {
    use sui::table::{Self, Table};
    use sui::clock::Clock;
    use sui::event;

    // ========== Error Codes ==========
    const E_NOT_ADMIN: u64 = 200;
    const E_BASELINE_EXISTS: u64 = 201;
    const E_BASELINE_NOT_FOUND: u64 = 202;
    const E_NO_ACTIVE_BASELINE: u64 = 203;
    const E_INVALID_PCR_LENGTH: u64 = 204;

    // ========== Constants ==========
    const PCR_LENGTH: u64 = 48;  // SHA-384 = 48 bytes

    // TEE types (same as executor.move)
    const TEE_NITRO: u8 = 1;
    #[allow(unused_const)]
    const TEE_SGX: u8 = 2;
    #[allow(unused_const)]
    const TEE_SEV: u8 = 3;

    // ========== Structs ==========

    /// Admin capability for managing attestation registry
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry for PCR baselines
    public struct AttestationRegistry has key {
        id: UID,
        /// Versioned PCR baselines (version -> baseline)
        baselines: Table<u64, PCRBaseline>,
        /// Current active baseline version
        current_version: u64,
        /// Total number of baselines registered
        total_baselines: u64,
    }

    /// A trusted PCR baseline for a specific TEE image version
    public struct PCRBaseline has store, copy, drop {
        version: u64,
        tee_type: u8,              // 1=Nitro, 2=SGX, 3=SEV
        pcr0: vector<u8>,          // Enclave image hash (48 bytes)
        pcr1: vector<u8>,          // Kernel hash (48 bytes)
        pcr2: vector<u8>,          // Application hash (48 bytes)
        description: vector<u8>,   // Human-readable description
        registered_at: u64,
        is_active: bool,
    }

    // ========== Events ==========

    public struct BaselineRegistered has copy, drop {
        version: u64,
        tee_type: u8,
        pcr0_prefix: vector<u8>,   // First 8 bytes for display
    }

    public struct BaselineActivated has copy, drop {
        version: u64,
        previous_version: u64,
    }

    public struct BaselineDeactivated has copy, drop {
        version: u64,
    }

    public struct PCRVerificationResult has copy, drop {
        version: u64,
        is_valid: bool,
        tee_type: u8,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        // Create AdminCap for the deployer
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        // Create shared AttestationRegistry
        let registry = AttestationRegistry {
            id: object::new(ctx),
            baselines: table::new(ctx),
            current_version: 0,
            total_baselines: 0,
        };
        transfer::share_object(registry);
    }

    // ========== Admin Functions ==========

    /// Register a new PCR baseline
    public entry fun register_baseline(
        _admin: &AdminCap,
        registry: &mut AttestationRegistry,
        version: u64,
        tee_type: u8,
        pcr0: vector<u8>,
        pcr1: vector<u8>,
        pcr2: vector<u8>,
        description: vector<u8>,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        // Validate PCR lengths
        assert!(vector::length(&pcr0) == PCR_LENGTH, E_INVALID_PCR_LENGTH);
        assert!(vector::length(&pcr1) == PCR_LENGTH, E_INVALID_PCR_LENGTH);
        assert!(vector::length(&pcr2) == PCR_LENGTH, E_INVALID_PCR_LENGTH);

        // Check version doesn't exist
        assert!(!table::contains(&registry.baselines, version), E_BASELINE_EXISTS);

        let now = clock.timestamp_ms();

        // Get first 8 bytes of PCR0 for event
        let mut pcr0_prefix = vector::empty<u8>();
        let mut i = 0;
        while (i < 8 && i < vector::length(&pcr0)) {
            vector::push_back(&mut pcr0_prefix, *vector::borrow(&pcr0, i));
            i = i + 1;
        };

        let baseline = PCRBaseline {
            version,
            tee_type,
            pcr0,
            pcr1,
            pcr2,
            description,
            registered_at: now,
            is_active: false,
        };

        table::add(&mut registry.baselines, version, baseline);
        registry.total_baselines = registry.total_baselines + 1;

        event::emit(BaselineRegistered {
            version,
            tee_type,
            pcr0_prefix,
        });
    }

    /// Activate a baseline (sets it as current)
    public entry fun activate_baseline(
        _admin: &AdminCap,
        registry: &mut AttestationRegistry,
        version: u64,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.baselines, version), E_BASELINE_NOT_FOUND);

        let previous_version = registry.current_version;

        // Deactivate previous baseline if exists
        if (previous_version > 0 && table::contains(&registry.baselines, previous_version)) {
            let prev = table::borrow_mut(&mut registry.baselines, previous_version);
            prev.is_active = false;
        };

        // Activate new baseline
        let baseline = table::borrow_mut(&mut registry.baselines, version);
        baseline.is_active = true;
        registry.current_version = version;

        event::emit(BaselineActivated {
            version,
            previous_version,
        });
    }

    /// Deactivate a baseline
    public entry fun deactivate_baseline(
        _admin: &AdminCap,
        registry: &mut AttestationRegistry,
        version: u64,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.baselines, version), E_BASELINE_NOT_FOUND);

        let baseline = table::borrow_mut(&mut registry.baselines, version);
        baseline.is_active = false;

        // Clear current version if this was the active one
        if (registry.current_version == version) {
            registry.current_version = 0;
        };

        event::emit(BaselineDeactivated {
            version,
        });
    }

    // ========== Verification Functions ==========

    /// Verify PCR values against the current active baseline
    /// Returns true if all PCR values match
    public fun verify_pcr(
        registry: &AttestationRegistry,
        pcr0: &vector<u8>,
        pcr1: &vector<u8>,
        pcr2: &vector<u8>,
    ): bool {
        // No active baseline = verification fails
        if (registry.current_version == 0) {
            return false
        };

        if (!table::contains(&registry.baselines, registry.current_version)) {
            return false
        };

        let baseline = table::borrow(&registry.baselines, registry.current_version);

        if (!baseline.is_active) {
            return false
        };

        // Compare all PCR values
        vectors_equal(&baseline.pcr0, pcr0) &&
        vectors_equal(&baseline.pcr1, pcr1) &&
        vectors_equal(&baseline.pcr2, pcr2)
    }

    /// Verify PCR values and emit event with result
    public fun verify_pcr_with_event(
        registry: &AttestationRegistry,
        pcr0: &vector<u8>,
        pcr1: &vector<u8>,
        pcr2: &vector<u8>,
    ): bool {
        let is_valid = verify_pcr(registry, pcr0, pcr1, pcr2);

        let (version, tee_type) = if (registry.current_version > 0 &&
            table::contains(&registry.baselines, registry.current_version)) {
            let baseline = table::borrow(&registry.baselines, registry.current_version);
            (baseline.version, baseline.tee_type)
        } else {
            (0, 0)
        };

        event::emit(PCRVerificationResult {
            version,
            is_valid,
            tee_type,
        });

        is_valid
    }

    /// Verify PCR0 only (most common check)
    public fun verify_pcr0_only(
        registry: &AttestationRegistry,
        pcr0: &vector<u8>,
    ): bool {
        if (registry.current_version == 0) {
            return false
        };

        if (!table::contains(&registry.baselines, registry.current_version)) {
            return false
        };

        let baseline = table::borrow(&registry.baselines, registry.current_version);

        if (!baseline.is_active) {
            return false
        };

        vectors_equal(&baseline.pcr0, pcr0)
    }

    // ========== View Functions ==========

    /// Get current active baseline version
    public fun get_current_version(registry: &AttestationRegistry): u64 {
        registry.current_version
    }

    /// Check if registry has an active baseline
    public fun has_active_baseline(registry: &AttestationRegistry): bool {
        registry.current_version > 0 &&
        table::contains(&registry.baselines, registry.current_version)
    }

    /// Get baseline info by version
    public fun get_baseline(registry: &AttestationRegistry, version: u64): PCRBaseline {
        assert!(table::contains(&registry.baselines, version), E_BASELINE_NOT_FOUND);
        *table::borrow(&registry.baselines, version)
    }

    /// Get current active baseline
    public fun get_current_baseline(registry: &AttestationRegistry): PCRBaseline {
        assert!(registry.current_version > 0, E_NO_ACTIVE_BASELINE);
        assert!(table::contains(&registry.baselines, registry.current_version), E_BASELINE_NOT_FOUND);
        *table::borrow(&registry.baselines, registry.current_version)
    }

    /// Get total number of registered baselines
    public fun get_total_baselines(registry: &AttestationRegistry): u64 {
        registry.total_baselines
    }

    /// Get PCR0 from a baseline
    public fun get_baseline_pcr0(baseline: &PCRBaseline): vector<u8> {
        baseline.pcr0
    }

    /// Get TEE type from a baseline
    public fun get_baseline_tee_type(baseline: &PCRBaseline): u8 {
        baseline.tee_type
    }

    /// Check if a baseline is active
    public fun is_baseline_active(baseline: &PCRBaseline): bool {
        baseline.is_active
    }

    // ========== Helper Functions ==========

    /// Compare two vectors for equality
    fun vectors_equal(a: &vector<u8>, b: &vector<u8>): bool {
        let len_a = vector::length(a);
        let len_b = vector::length(b);

        if (len_a != len_b) {
            return false
        };

        let mut i = 0;
        while (i < len_a) {
            if (*vector::borrow(a, i) != *vector::borrow(b, i)) {
                return false
            };
            i = i + 1;
        };

        true
    }

    /// Get TEE type name (for display purposes)
    public fun tee_type_name(tee_type: u8): vector<u8> {
        if (tee_type == TEE_NITRO) {
            b"AWS Nitro"
        } else if (tee_type == TEE_SGX) {
            b"Intel SGX"
        } else if (tee_type == TEE_SEV) {
            b"AMD SEV"
        } else {
            b"Unknown"
        }
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
