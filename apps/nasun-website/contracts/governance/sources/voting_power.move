/// VotingPowerCertificate Module
///
/// Provides secure voting power verification through Oracle-signed certificates.
/// Certificates are one-time use objects that are burned when consumed.
///
/// Security features:
/// - Ed25519 signature verification
/// - Certificate expiration (TTL)
/// - Duplicate issuance prevention (CertificateRegistry)
/// - Oracle key rotation with grace period
/// - Pause capability for emergencies
module governance::voting_power;

use sui::ed25519;
use sui::clock::Clock;
use sui::event;
use sui::bcs;
use sui::table::{Self, Table};
use governance::dashboard::AdminCap;

// === Errors ===
const EInvalidSignature: u64 = 0;
const ECertificateExpired: u64 = 1;
const EProposalMismatch: u64 = 2;
const EVoterMismatch: u64 = 3;
const EOraclePaused: u64 = 4;
const EInvalidPublicKey: u64 = 5;
const ECertificateAlreadyIssued: u64 = 6;

// === Structs ===

/// Oracle configuration - stores Ed25519 public keys for signature verification
public struct VotingPowerOracle has key, store {
    id: UID,
    /// Current Ed25519 public key (32 bytes)
    public_key: vector<u8>,
    /// Previous public key for grace period rotation
    previous_public_key: Option<vector<u8>>,
    /// Timestamp when key was last rotated
    rotation_timestamp: u64,
    /// Grace period in milliseconds (e.g., 1 hour = 3600000)
    rotation_grace_period: u64,
    /// Emergency pause flag
    is_paused: bool,
}

/// Certificate Registry - tracks issued certificates to prevent duplicates
public struct CertificateRegistry has key {
    id: UID,
    /// voter address -> (proposal_id -> issued)
    issued: Table<address, Table<ID, bool>>,
}

/// Voting Power Certificate - one-time use, burned on vote
/// This is a `has key` object that can only be consumed by proposal::vote
public struct VotingPowerCertificate has key {
    id: UID,
    /// The voter who can use this certificate
    voter: address,
    /// The proposal this certificate is valid for
    proposal_id: ID,
    /// The voting power amount
    voting_power: u64,
    /// Expiration timestamp in milliseconds
    expires_at: u64,
    /// Oracle ID that issued this certificate (for multi-oracle support)
    issuer: ID,
}

// === Events ===

public struct CertificateMinted has copy, drop {
    certificate_id: ID,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
    issuer: ID,
}

public struct CertificateConsumed has copy, drop {
    certificate_id: ID,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
}

public struct OracleKeyRotated has copy, drop {
    oracle_id: ID,
    new_public_key: vector<u8>,
    rotated_at: u64,
}

public struct OraclePaused has copy, drop {
    oracle_id: ID,
    paused: bool,
}

// === Admin Functions ===

/// Create a new VotingPowerOracle (AdminCap required)
/// grace_period: Time in milliseconds to accept signatures from previous key
public fun create_oracle(
    _admin_cap: &AdminCap,
    public_key: vector<u8>,
    grace_period: u64,
    ctx: &mut TxContext
): VotingPowerOracle {
    assert!(public_key.length() == 32, EInvalidPublicKey);

    VotingPowerOracle {
        id: object::new(ctx),
        public_key,
        previous_public_key: option::none(),
        rotation_timestamp: 0,
        rotation_grace_period: grace_period,
        is_paused: false,
    }
}

/// Create a CertificateRegistry (AdminCap required)
public fun create_registry(
    _admin_cap: &AdminCap,
    ctx: &mut TxContext
): CertificateRegistry {
    CertificateRegistry {
        id: object::new(ctx),
        issued: table::new(ctx),
    }
}

/// Share the Oracle as a shared object
public fun share_oracle(oracle: VotingPowerOracle) {
    transfer::share_object(oracle);
}

/// Share the Registry as a shared object
public fun share_registry(registry: CertificateRegistry) {
    transfer::share_object(registry);
}

/// Rotate Oracle key with grace period for existing signatures
public fun rotate_oracle_key(
    oracle: &mut VotingPowerOracle,
    _admin_cap: &AdminCap,
    new_public_key: vector<u8>,
    clock: &Clock,
) {
    assert!(new_public_key.length() == 32, EInvalidPublicKey);

    // Move current key to previous
    oracle.previous_public_key = option::some(oracle.public_key);
    oracle.public_key = new_public_key;
    oracle.rotation_timestamp = clock.timestamp_ms();

    event::emit(OracleKeyRotated {
        oracle_id: object::id(oracle),
        new_public_key,
        rotated_at: clock.timestamp_ms(),
    });
}

/// Pause/unpause certificate issuance for emergencies
public fun set_oracle_paused(
    oracle: &mut VotingPowerOracle,
    _admin_cap: &AdminCap,
    paused: bool,
) {
    oracle.is_paused = paused;

    event::emit(OraclePaused {
        oracle_id: object::id(oracle),
        paused,
    });
}

// === Public Functions ===

/// Mint a VotingPowerCertificate with Oracle signature verification
///
/// Message format (for signature): voter (32 bytes) || proposal_id (32 bytes) ||
///                                 voting_power (8 bytes BE) || expires_at (8 bytes BE)
public fun mint_certificate(
    oracle: &VotingPowerOracle,
    registry: &mut CertificateRegistry,
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
    signature: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
): VotingPowerCertificate {
    // Check oracle is not paused
    assert!(!oracle.is_paused, EOraclePaused);

    // Check certificate hasn't expired
    assert!(expires_at > clock.timestamp_ms(), ECertificateExpired);

    // Check for duplicate issuance
    if (registry.issued.contains(voter)) {
        let voter_certs = registry.issued.borrow(voter);
        assert!(!voter_certs.contains(proposal_id), ECertificateAlreadyIssued);
    };

    // Build message for signature verification
    let msg = build_certificate_message(voter, proposal_id, voting_power, expires_at);

    // Verify signature with current key
    let mut valid = ed25519::ed25519_verify(&signature, &oracle.public_key, &msg);

    // Try previous key within grace period if current key fails
    if (!valid && oracle.previous_public_key.is_some()) {
        let grace_end = oracle.rotation_timestamp + oracle.rotation_grace_period;
        if (clock.timestamp_ms() < grace_end) {
            let prev_key = oracle.previous_public_key.borrow();
            valid = ed25519::ed25519_verify(&signature, prev_key, &msg);
        };
    };

    assert!(valid, EInvalidSignature);

    // Record issuance in registry
    if (!registry.issued.contains(voter)) {
        registry.issued.add(voter, table::new(ctx));
    };
    let voter_certs = registry.issued.borrow_mut(voter);
    voter_certs.add(proposal_id, true);

    // Create certificate
    let certificate = VotingPowerCertificate {
        id: object::new(ctx),
        voter,
        proposal_id,
        voting_power,
        expires_at,
        issuer: object::id(oracle),
    };

    event::emit(CertificateMinted {
        certificate_id: object::id(&certificate),
        voter,
        proposal_id,
        voting_power,
        expires_at,
        issuer: object::id(oracle),
    });

    certificate
}

/// Consume certificate and return voting power (called by proposal::vote)
/// The certificate is burned after consumption to prevent reuse
public(package) fun consume_certificate(
    certificate: VotingPowerCertificate,
    proposal_id: ID,
    clock: &Clock,
    ctx: &TxContext
): u64 {
    // Verify voter matches transaction sender
    assert!(certificate.voter == ctx.sender(), EVoterMismatch);

    // Verify proposal matches
    assert!(certificate.proposal_id == proposal_id, EProposalMismatch);

    // Verify not expired
    assert!(certificate.expires_at > clock.timestamp_ms(), ECertificateExpired);

    let voting_power = certificate.voting_power;
    let cert_id = object::id(&certificate);

    // Emit consumption event before burning
    event::emit(CertificateConsumed {
        certificate_id: cert_id,
        voter: certificate.voter,
        proposal_id: certificate.proposal_id,
        voting_power,
    });

    // Burn certificate (destructure and delete)
    let VotingPowerCertificate {
        id,
        voter: _,
        proposal_id: _,
        voting_power: _,
        expires_at: _,
        issuer: _,
    } = certificate;
    object::delete(id);

    voting_power
}

// === Helper Functions ===

/// Build message for signature verification
/// Format: voter (BCS) || proposal_id (BCS) || voting_power (8 bytes BE) || expires_at (8 bytes BE)
fun build_certificate_message(
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64
): vector<u8> {
    let mut msg = vector::empty<u8>();
    vector::append(&mut msg, bcs::to_bytes(&voter));
    vector::append(&mut msg, bcs::to_bytes(&proposal_id));
    vector::append(&mut msg, u64_to_be_bytes(voting_power));
    vector::append(&mut msg, u64_to_be_bytes(expires_at));
    msg
}

/// Convert u64 to big-endian bytes (8 bytes)
fun u64_to_be_bytes(value: u64): vector<u8> {
    let mut bytes = vector::empty<u8>();
    let mut i = 0;
    while (i < 8) {
        let shift = (7 - i) * 8;
        bytes.push_back(((value >> (shift as u8)) & 0xFF) as u8);
        i = i + 1;
    };
    bytes
}

// === View Functions ===

public fun oracle_public_key(oracle: &VotingPowerOracle): vector<u8> {
    oracle.public_key
}

public fun oracle_is_paused(oracle: &VotingPowerOracle): bool {
    oracle.is_paused
}

public fun oracle_grace_period(oracle: &VotingPowerOracle): u64 {
    oracle.rotation_grace_period
}

/// Check if certificate was already issued for voter + proposal
public fun is_certificate_issued(
    registry: &CertificateRegistry,
    voter: address,
    proposal_id: ID
): bool {
    if (!registry.issued.contains(voter)) {
        return false
    };
    let voter_certs = registry.issued.borrow(voter);
    voter_certs.contains(proposal_id)
}

// === Test Functions ===

#[test_only]
public fun create_test_oracle(
    public_key: vector<u8>,
    grace_period: u64,
    ctx: &mut TxContext
): VotingPowerOracle {
    VotingPowerOracle {
        id: object::new(ctx),
        public_key,
        previous_public_key: option::none(),
        rotation_timestamp: 0,
        rotation_grace_period: grace_period,
        is_paused: false,
    }
}

#[test_only]
public fun create_test_registry(ctx: &mut TxContext): CertificateRegistry {
    CertificateRegistry {
        id: object::new(ctx),
        issued: table::new(ctx),
    }
}

#[test_only]
public fun create_test_certificate(
    voter: address,
    proposal_id: ID,
    voting_power: u64,
    expires_at: u64,
    issuer: ID,
    ctx: &mut TxContext
): VotingPowerCertificate {
    VotingPowerCertificate {
        id: object::new(ctx),
        voter,
        proposal_id,
        voting_power,
        expires_at,
        issuer,
    }
}
