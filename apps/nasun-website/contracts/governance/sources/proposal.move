module governance::proposal;

use std::string::String;
use sui::table::{Self, Table};
use sui::url::{Url, new_unsafe_from_bytes};
use sui::clock::Clock;
use sui::event;
use governance::dashboard::AdminCap;
use governance::voting_power::{Self, VotingPowerCertificate};

const EDuplicateVote: u64 = 0;
const EProposalDelisted: u64 = 1;
const EProposalExpired: u64 = 2;
const EDeprecatedFunction: u64 = 3;
const EInvalidProposalType: u64 = 4;

public enum ProposalStatus has store, drop {
    Active,
    Delisted,
}

/// Proposal type determines voting rules and gas payment
/// - Governance: User pays gas, binding decision for protocol changes
/// - Poll: Sponsored (zero gas), non-binding community sentiment
public enum ProposalType has store, drop, copy {
    Governance,  // User pays gas fee
    Poll,        // Sponsored (Zero Gas Fee)
}

/// Registry to store proposal types (separate from Proposal struct for upgrade compatibility)
/// Proposals not in registry default to Governance type
public struct ProposalTypeRegistry has key {
    id: UID,
    /// Maps proposal ID to its type
    types: Table<ID, ProposalType>,
}

/// Vote record storing the voter's choice and voting power
public struct VoteRecord has store, drop {
    vote_yes: bool,
    voting_power: u64,
}

public struct Proposal has key {
    id: UID,
    title: String,
    description: String,
    /// Total voting power for Yes votes
    total_power_yes: u64,
    /// Total voting power for No votes
    total_power_no: u64,
    /// Number of Yes voters (for reference)
    vote_count_yes: u64,
    /// Number of No voters (for reference)
    vote_count_no: u64,
    expiration: u64,
    creator: address,
    status: ProposalStatus,
    /// Voter address -> VoteRecord (choice + power)
    voters: Table<address, VoteRecord>,
}

public struct VoteProofNFT has key {
    id: UID,
    proposal_id: ID,
    name: String,
    description: String,
    url: Url,
}

public struct VoteRegistered has copy, drop {
    proposal_id: ID,
    voter: address,
    vote_yes: bool,
    voting_power: u64,
}

// === Public Functions ===

/// DEPRECATED: This function is disabled. Use vote_with_certificate() instead.
/// Kept for upgrade compatibility only.
public fun vote(
    _self: &mut Proposal,
    _vote_yes: bool,
    _voting_power: u64,
    _clock: &Clock,
    _ctx: &mut TxContext
) {
    // This function is deprecated and always aborts
    // Use vote_with_certificate() with Oracle-signed certificate instead
    abort EDeprecatedFunction
}

/// Vote on a proposal with Oracle-signed VotingPowerCertificate
/// The certificate is burned after use to prevent replay attacks
public fun vote_with_certificate(
    self: &mut Proposal,
    vote_yes: bool,
    certificate: VotingPowerCertificate,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(self.expiration > clock.timestamp_ms(), EProposalExpired);
    assert!(self.is_active(), EProposalDelisted);
    assert!(!self.voters.contains(ctx.sender()), EDuplicateVote);

    // Consume certificate and get verified voting power
    // This also validates: voter matches sender, proposal matches, not expired
    // Certificate is burned after consumption
    let voting_power = voting_power::consume_certificate(
        certificate,
        self.id.to_inner(),
        clock,
        ctx
    );

    if (vote_yes) {
        self.total_power_yes = self.total_power_yes + voting_power;
        self.vote_count_yes = self.vote_count_yes + 1;
    } else {
        self.total_power_no = self.total_power_no + voting_power;
        self.vote_count_no = self.vote_count_no + 1;
    };

    self.voters.add(ctx.sender(), VoteRecord { vote_yes, voting_power });
    issue_vote_proof(self, vote_yes, ctx);

    event::emit(VoteRegistered {
        proposal_id: self.id.to_inner(),
        voter: ctx.sender(),
        vote_yes,
        voting_power
    });
}

// === View Functions ===

public fun vote_proof_url(self: &VoteProofNFT): Url {
    self.url
}

public fun is_active(self: &Proposal): bool {
    let status = self.status();

    match (status) {
        ProposalStatus::Active => true,
        _ => false,
    }
}

public fun status(self: &Proposal): &ProposalStatus {
    &self.status
}

public fun title(self: &Proposal): String {
    self.title
}

public fun description(self: &Proposal): String {
    self.description
}

public fun total_power_yes(self: &Proposal): u64 {
    self.total_power_yes
}

public fun total_power_no(self: &Proposal): u64 {
    self.total_power_no
}

public fun vote_count_yes(self: &Proposal): u64 {
    self.vote_count_yes
}

public fun vote_count_no(self: &Proposal): u64 {
    self.vote_count_no
}

public fun expiration(self: &Proposal): u64 {
    self.expiration
}

public fun creator(self: &Proposal): address {
    self.creator
}

public fun voters(self: &Proposal): &Table<address, VoteRecord> {
    &self.voters
}

// === Admin Functions ===

public fun create(
    _admin_cap: &AdminCap,
    title: String,
    description: String,
    expiration: u64,
    ctx: &mut TxContext
): ID {
    let proposal = Proposal {
        id: object::new(ctx),
        title,
        description,
        total_power_yes: 0,
        total_power_no: 0,
        vote_count_yes: 0,
        vote_count_no: 0,
        expiration,
        creator: ctx.sender(),
        status: ProposalStatus::Active,
        voters: table::new(ctx),
    };

    let id = proposal.id.to_inner();
    transfer::share_object(proposal);

    id
}

public fun remove(self: Proposal, _admin_cap: &AdminCap) {
    let Proposal {
        id,
        title: _,
        description: _,
        total_power_yes: _,
        total_power_no: _,
        vote_count_yes: _,
        vote_count_no: _,
        expiration: _,
        status: _,
        voters,
        creator: _,
    } = self;

    table::drop(voters);
    object::delete(id)
}

public fun set_active_status(self: &mut Proposal, admin_cap: &AdminCap) {
    self.change_status(admin_cap,  ProposalStatus::Active);
}

public fun set_delisted_status(self: &mut Proposal, admin_cap: &AdminCap) {
    self.change_status(admin_cap,  ProposalStatus::Delisted);
}

fun change_status(
    self: &mut Proposal,
    _admin_cap: &AdminCap,
    status: ProposalStatus
) {
    self.status = status;
}

// === ProposalTypeRegistry Functions ===

/// Initialize the proposal type registry (one-time setup)
public fun init_type_registry(_admin_cap: &AdminCap, ctx: &mut TxContext) {
    let registry = ProposalTypeRegistry {
        id: object::new(ctx),
        types: table::new(ctx),
    };
    transfer::share_object(registry);
}

/// Set proposal type in registry (admin only)
/// proposal_type: 0 = Governance, 1 = Poll
public fun set_proposal_type(
    registry: &mut ProposalTypeRegistry,
    _admin_cap: &AdminCap,
    proposal_id: ID,
    proposal_type: u8,
) {
    let ptype = if (proposal_type == 0) {
        ProposalType::Governance
    } else if (proposal_type == 1) {
        ProposalType::Poll
    } else {
        abort EInvalidProposalType
    };

    if (registry.types.contains(proposal_id)) {
        registry.types.remove(proposal_id);
    };
    registry.types.add(proposal_id, ptype);
}

/// Get proposal type from registry (returns 0/Governance if not found)
public fun get_proposal_type(registry: &ProposalTypeRegistry, proposal_id: ID): u8 {
    if (registry.types.contains(proposal_id)) {
        let ptype = registry.types.borrow(proposal_id);
        match (ptype) {
            ProposalType::Governance => 0,
            ProposalType::Poll => 1,
        }
    } else {
        0 // Default to Governance for legacy proposals
    }
}

/// Check if proposal is sponsored (Poll type = zero gas)
public fun is_sponsored(registry: &ProposalTypeRegistry, proposal_id: ID): bool {
    if (registry.types.contains(proposal_id)) {
        let ptype = registry.types.borrow(proposal_id);
        match (ptype) {
            ProposalType::Poll => true,
            ProposalType::Governance => false,
        }
    } else {
        false // Default to non-sponsored (Governance)
    }
}

fun issue_vote_proof(proposal: &Proposal, vote_yes: bool, ctx: &mut TxContext) {
    let mut name = b"NFT ".to_string();
    name.append(proposal.title);

    let mut description = b"Proof of votting on ".to_string();
    let proposal_address = object::id_address(proposal).to_string();
    description.append(proposal_address);

    let vote_yes_image = new_unsafe_from_bytes(b"https://thrangra.sirv.com/vote_yes_nft.jpg");
    let vote_no_image = new_unsafe_from_bytes(b"https://thrangra.sirv.com/vote_no_nft.jpg");

    let url = if (vote_yes) { vote_yes_image } else { vote_no_image };

    let proof = VoteProofNFT {
        id: object::new(ctx),
        proposal_id: proposal.id.to_inner(),
        name,
        description,
        url
    };

    transfer::transfer(proof, ctx.sender());
}

