/// Multi-Choice Proposal Module
///
/// Extends the governance system to support proposals with multiple choices
/// (single-select). Existing Yes/No proposals are unaffected.
///
/// Features:
/// - 2-20 choices per proposal
/// - Per-choice text length limit (200 bytes)
/// - Equal weight mode (1 vote per wallet) or weighted voting power
/// - Reuses VotingPowerCertificate from voting_power module
module governance::multi_choice_proposal;

use std::string::String;
use sui::table::{Self, Table};
use sui::clock::Clock;
use sui::event;
use sui::url::{Url, new_unsafe_from_bytes};
use governance::dashboard::AdminCap;
use governance::voting_power::{Self, VotingPowerCertificate};

// === Errors ===
const EDuplicateVote: u64 = 0;
const EProposalDelisted: u64 = 1;
const EProposalExpired: u64 = 2;
const EInvalidChoiceIndex: u64 = 3;
const ETooFewChoices: u64 = 4;
const ETooManyChoices: u64 = 5;
const EChoiceTooLong: u64 = 6;

// === Constants ===
const MIN_CHOICES: u64 = 2;
const MAX_CHOICES: u64 = 20;
const MAX_CHOICE_BYTES: u64 = 200;

// === Enums ===

public enum MultiChoiceProposalStatus has store, drop {
    Active,
    Delisted,
}

// === Structs ===

public struct MultiChoiceVoteRecord has store, drop {
    selected_choice: u64,
    voting_power: u64,
}

public struct MultiChoiceProposal has key {
    id: UID,
    title: String,
    description: String,
    /// Choice labels (e.g., ["Option A", "Option B", "Option C"])
    choices: vector<String>,
    /// Accumulated voting power per choice (same order as choices)
    choice_powers: vector<u64>,
    /// Number of voters per choice (same order as choices)
    choice_counts: vector<u64>,
    /// If true, every voter has equal weight of 1 regardless of certificate power
    use_equal_weight: bool,
    expiration: u64,
    creator: address,
    status: MultiChoiceProposalStatus,
    /// Voter address -> MultiChoiceVoteRecord
    voters: Table<address, MultiChoiceVoteRecord>,
}

public struct MultiChoiceVoteProofNFT has key {
    id: UID,
    proposal_id: ID,
    name: String,
    description: String,
    url: Url,
}

// === Events ===

public struct MultiChoiceVoteRegistered has copy, drop {
    proposal_id: ID,
    voter: address,
    selected_choice: u64,
    voting_power: u64,
}

// === Public Functions ===

/// Vote on a multi-choice proposal with Oracle-signed VotingPowerCertificate
/// The certificate is burned after use to prevent replay attacks
public fun vote_with_certificate(
    self: &mut MultiChoiceProposal,
    selected_choice: u64,
    certificate: VotingPowerCertificate,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(self.expiration > clock.timestamp_ms(), EProposalExpired);
    assert!(self.is_active(), EProposalDelisted);
    assert!(!self.voters.contains(ctx.sender()), EDuplicateVote);
    assert!(selected_choice < self.choices.length(), EInvalidChoiceIndex);

    // Consume certificate and get verified voting power
    // Validates: voter matches sender, proposal matches, not expired
    // Certificate is burned after consumption
    let raw_power = voting_power::consume_certificate(
        certificate,
        self.id.to_inner(),
        clock,
        ctx
    );

    // Apply equal weight if configured
    let power = if (self.use_equal_weight) { 1 } else { raw_power };

    // Update choice tallies
    *&mut self.choice_powers[selected_choice] = self.choice_powers[selected_choice] + power;
    *&mut self.choice_counts[selected_choice] = self.choice_counts[selected_choice] + 1;

    self.voters.add(ctx.sender(), MultiChoiceVoteRecord {
        selected_choice,
        voting_power: power,
    });

    event::emit(MultiChoiceVoteRegistered {
        proposal_id: self.id.to_inner(),
        voter: ctx.sender(),
        selected_choice,
        voting_power: power,
    });

    issue_vote_proof(self, ctx);
}

// === View Functions ===

public fun is_active(self: &MultiChoiceProposal): bool {
    match (&self.status) {
        MultiChoiceProposalStatus::Active => true,
        _ => false,
    }
}

public fun title(self: &MultiChoiceProposal): String { self.title }
public fun description(self: &MultiChoiceProposal): String { self.description }
public fun choices(self: &MultiChoiceProposal): &vector<String> { &self.choices }
public fun choice_powers(self: &MultiChoiceProposal): &vector<u64> { &self.choice_powers }
public fun choice_counts(self: &MultiChoiceProposal): &vector<u64> { &self.choice_counts }
public fun use_equal_weight(self: &MultiChoiceProposal): bool { self.use_equal_weight }
public fun expiration(self: &MultiChoiceProposal): u64 { self.expiration }
public fun creator(self: &MultiChoiceProposal): address { self.creator }

// === Admin Functions ===

/// Create a new multi-choice proposal (AdminCap required)
/// choices must have 2-20 items, each at most 200 bytes
public fun create(
    _admin_cap: &AdminCap,
    title: String,
    description: String,
    choices: vector<String>,
    use_equal_weight: bool,
    expiration: u64,
    ctx: &mut TxContext
): ID {
    let num_choices = choices.length();
    assert!(num_choices >= MIN_CHOICES, ETooFewChoices);
    assert!(num_choices <= MAX_CHOICES, ETooManyChoices);

    // Validate each choice text length
    let mut i = 0;
    while (i < num_choices) {
        assert!(choices[i].length() <= MAX_CHOICE_BYTES, EChoiceTooLong);
        i = i + 1;
    };

    // Initialize zero-filled power and count vectors
    let mut choice_powers = vector::empty<u64>();
    let mut choice_counts = vector::empty<u64>();
    let mut j = 0;
    while (j < num_choices) {
        choice_powers.push_back(0);
        choice_counts.push_back(0);
        j = j + 1;
    };

    let proposal = MultiChoiceProposal {
        id: object::new(ctx),
        title,
        description,
        choices,
        choice_powers,
        choice_counts,
        use_equal_weight,
        expiration,
        creator: ctx.sender(),
        status: MultiChoiceProposalStatus::Active,
        voters: table::new(ctx),
    };

    let id = proposal.id.to_inner();
    transfer::share_object(proposal);

    id
}

/// Remove a multi-choice proposal (only works if voters table is empty)
public fun remove(self: MultiChoiceProposal, _admin_cap: &AdminCap) {
    let MultiChoiceProposal {
        id,
        title: _,
        description: _,
        choices: _,
        choice_powers: _,
        choice_counts: _,
        use_equal_weight: _,
        expiration: _,
        status: _,
        voters,
        creator: _,
    } = self;

    table::drop(voters);
    object::delete(id);
}

public fun set_active_status(self: &mut MultiChoiceProposal, _admin_cap: &AdminCap) {
    self.status = MultiChoiceProposalStatus::Active;
}

public fun set_delisted_status(self: &mut MultiChoiceProposal, _admin_cap: &AdminCap) {
    self.status = MultiChoiceProposalStatus::Delisted;
}

// === Internal Functions ===

fun issue_vote_proof(proposal: &MultiChoiceProposal, ctx: &mut TxContext) {
    let mut name = b"NFT ".to_string();
    name.append(proposal.title);

    let mut description = b"Proof of voting on ".to_string();
    let proposal_address = object::id_address(proposal).to_string();
    description.append(proposal_address);

    let url = new_unsafe_from_bytes(
        b"https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreidvwd65472yxlhr4vhoqxqugccpy6xgsat2mdb6vjznltodkxw4tu"
    );

    let proof = MultiChoiceVoteProofNFT {
        id: object::new(ctx),
        proposal_id: proposal.id.to_inner(),
        name,
        description,
        url,
    };

    transfer::transfer(proof, ctx.sender());
}

// === Test Helpers ===

#[test_only]
public fun create_test_proposal(
    choices: vector<String>,
    use_equal_weight: bool,
    expiration: u64,
    ctx: &mut TxContext
): MultiChoiceProposal {
    let num_choices = choices.length();
    let mut choice_powers = vector::empty<u64>();
    let mut choice_counts = vector::empty<u64>();
    let mut i = 0;
    while (i < num_choices) {
        choice_powers.push_back(0);
        choice_counts.push_back(0);
        i = i + 1;
    };

    MultiChoiceProposal {
        id: object::new(ctx),
        title: b"Test Proposal".to_string(),
        description: b"Test Description".to_string(),
        choices,
        choice_powers,
        choice_counts,
        use_equal_weight,
        expiration,
        creator: ctx.sender(),
        status: MultiChoiceProposalStatus::Active,
        voters: table::new(ctx),
    }
}
