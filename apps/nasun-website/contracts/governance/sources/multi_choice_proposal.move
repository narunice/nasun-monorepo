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
use sui::dynamic_field;
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
const EInvalidImageUrl: u64 = 7;

// === Constants ===
const MIN_CHOICES: u64 = 2;
const MAX_CHOICES: u64 = 20;
const MAX_CHOICE_BYTES: u64 = 200;

// Keep in sync with proposal::set_vote_proof_image
const VOTE_PROOF_IMAGE_KEY: vector<u8> = b"vote_proof_image";
const DEFAULT_VOTE_PROOF_IMAGE: vector<u8> = b"https://arweave.net/PeICdNym7MWjAvEqbPURGo21Mq-bo97sMghdK8CrqRQ";
const MAX_URL_BYTES: u64 = 2048;

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
        mut id,
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

    // Clean up dynamic field before UID deletion
    if (dynamic_field::exists_(&id, VOTE_PROOF_IMAGE_KEY)) {
        let _: Url = dynamic_field::remove(&mut id, VOTE_PROOF_IMAGE_KEY);
    };

    table::drop(voters);
    object::delete(id);
}

public fun set_active_status(self: &mut MultiChoiceProposal, _admin_cap: &AdminCap) {
    self.status = MultiChoiceProposalStatus::Active;
}

public fun set_delisted_status(self: &mut MultiChoiceProposal, _admin_cap: &AdminCap) {
    self.status = MultiChoiceProposalStatus::Delisted;
}

/// Set custom vote proof NFT image URL for this proposal (admin only)
/// Keep in sync with proposal::set_vote_proof_image
public fun set_vote_proof_image(
    self: &mut MultiChoiceProposal,
    _admin_cap: &AdminCap,
    url_bytes: vector<u8>,
) {
    assert!(url_bytes.length() >= 8, EInvalidImageUrl);
    assert!(url_bytes.length() <= MAX_URL_BYTES, EInvalidImageUrl);
    let prefix = vector[104, 116, 116, 112, 115, 58, 47, 47]; // "https://"
    let mut i = 0;
    while (i < 8) {
        assert!(url_bytes[i] == prefix[i], EInvalidImageUrl);
        i = i + 1;
    };

    let url = new_unsafe_from_bytes(url_bytes);
    if (dynamic_field::exists_(&self.id, VOTE_PROOF_IMAGE_KEY)) {
        *dynamic_field::borrow_mut(&mut self.id, VOTE_PROOF_IMAGE_KEY) = url;
    } else {
        dynamic_field::add(&mut self.id, VOTE_PROOF_IMAGE_KEY, url);
    };
}

// === Restore Functions (admin only, post-devnet-reset) ===

/// Restore a MultiChoiceVoteProofNFT from off-chain snapshot data.
public fun admin_restore_vote_proof(
    _admin_cap: &AdminCap,
    proposal_id_bytes: address,
    name: String,
    description: String,
    url_bytes: vector<u8>,
    recipient: address,
    ctx: &mut TxContext
) {
    let proof = MultiChoiceVoteProofNFT {
        id: object::new(ctx),
        proposal_id: object::id_from_address(proposal_id_bytes),
        name,
        description,
        url: new_unsafe_from_bytes(url_bytes),
    };
    transfer::transfer(proof, recipient);
}

/// Batch restore MultiChoiceVoteProofNFTs (max 50 per call)
public fun batch_restore_vote_proofs(
    _admin_cap: &AdminCap,
    proposal_ids: vector<address>,
    names: vector<String>,
    descriptions: vector<String>,
    urls: vector<vector<u8>>,
    recipients: vector<address>,
    ctx: &mut TxContext
) {
    let len = proposal_ids.length();
    assert!(len <= 50, 100);
    assert!(len == names.length(), 101);
    assert!(len == descriptions.length(), 101);
    assert!(len == urls.length(), 101);
    assert!(len == recipients.length(), 101);

    let mut i = 0;
    while (i < len) {
        let proof = MultiChoiceVoteProofNFT {
            id: object::new(ctx),
            proposal_id: object::id_from_address(proposal_ids[i]),
            name: names[i],
            description: descriptions[i],
            url: new_unsafe_from_bytes(urls[i]),
        };
        transfer::transfer(proof, recipients[i]);
        i = i + 1;
    };
}

// === Internal Functions ===

fun issue_vote_proof(proposal: &MultiChoiceProposal, ctx: &mut TxContext) {
    let mut name = b"NFT ".to_string();
    name.append(proposal.title);

    let mut description = b"Proof of voting on ".to_string();
    let proposal_address = object::id_address(proposal).to_string();
    description.append(proposal_address);

    // Use per-proposal image if set, otherwise fallback to default
    let url = if (dynamic_field::exists_(&proposal.id, VOTE_PROOF_IMAGE_KEY)) {
        *dynamic_field::borrow(&proposal.id, VOTE_PROOF_IMAGE_KEY)
    } else {
        new_unsafe_from_bytes(DEFAULT_VOTE_PROOF_IMAGE)
    };

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
