module governance::proposal;

use std::string::String;
use sui::table::{Self, Table};
use sui::url::{Url, new_unsafe_from_bytes};
use sui::clock::{Clock};
use sui::event;
use governance::dashboard::AdminCap;

const EDuplicateVote: u64 = 0;
const EProposalDelisted: u64 = 1;
const EProposalExpired: u64 = 2;

public enum ProposalStatus has store, drop {
    Active,
    Delisted,
}

public struct Proposal has key {
    id: UID,
    title: String,
    description: String,
    voted_yes_count: u64,
    voted_no_count: u64,
    expiration: u64,
    creator: address,
    status: ProposalStatus,
    voters: Table<address, bool>,
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
}

// === Public Functions ===

public fun vote(self: &mut Proposal, vote_yes: bool, clock: &Clock, ctx: &mut TxContext) {
    assert!(self.expiration > clock.timestamp_ms(), EProposalExpired);
    assert!(self.is_active(), EProposalDelisted);
    assert!(!self.voters.contains(ctx.sender()), EDuplicateVote);

    if (vote_yes) {
        self.voted_yes_count = self.voted_yes_count + 1;
    } else {
        self.voted_no_count = self.voted_no_count + 1;
    };

    self.voters.add(ctx.sender(), vote_yes);
    issue_vote_proof(self, vote_yes, ctx);

    event::emit(VoteRegistered {
        proposal_id: self.id.to_inner(),
        voter: ctx.sender(),
        vote_yes
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

public fun voted_yes_count(self: &Proposal): u64 {
    self.voted_yes_count
}

public fun voted_no_count(self: &Proposal): u64 {
    self.voted_no_count
}

public fun expiration(self: &Proposal): u64 {
    self.expiration
}

public fun creator(self: &Proposal): address {
    self.creator
}

public fun voters(self: &Proposal): &Table<address, bool> {
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
        voted_yes_count: 0,
        voted_no_count: 0,
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
        voted_yes_count: _,
        voted_no_count: _,
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

