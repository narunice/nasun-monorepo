/// Delegation module for Nasun Governance
///
/// Allows users to delegate their voting power to another address.
/// Delegates can vote on behalf of their delegators.
module governance::delegation;

use sui::table::{Self, Table};
use sui::event;
use governance::dashboard::AdminCap;

// === Errors ===
const EAlreadyDelegated: u64 = 0;
const ENotDelegated: u64 = 1;
const ESelfDelegation: u64 = 2;
const ECircularDelegation: u64 = 3;

// === Structs ===

/// Registry that tracks all delegations
/// Shared object accessible by all users
public struct DelegationRegistry has key {
    id: UID,
    /// delegator -> delegate mapping
    delegations: Table<address, address>,
    /// delegate -> list of delegators mapping
    delegators_of: Table<address, vector<address>>,
}

// === Events ===

public struct DelegationCreated has copy, drop {
    delegator: address,
    delegate: address,
}

public struct DelegationRevoked has copy, drop {
    delegator: address,
    delegate: address,
}

// === Init ===

/// Initialize the delegation registry
/// Called once during package deployment
public fun init_registry(_admin_cap: &AdminCap, ctx: &mut TxContext) {
    let registry = DelegationRegistry {
        id: object::new(ctx),
        delegations: table::new(ctx),
        delegators_of: table::new(ctx),
    };

    transfer::share_object(registry);
}

// === Public Functions ===

/// Delegate voting power to another address
/// The delegate will be able to vote with the delegator's voting power
public fun delegate(
    registry: &mut DelegationRegistry,
    to: address,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();

    // Cannot delegate to self
    assert!(sender != to, ESelfDelegation);

    // Cannot delegate if already delegated (must revoke first)
    assert!(!registry.delegations.contains(sender), EAlreadyDelegated);

    // Prevent circular delegation: check if 'to' has delegated to sender
    if (registry.delegations.contains(to)) {
        let to_delegate = *registry.delegations.borrow(to);
        assert!(to_delegate != sender, ECircularDelegation);
    };

    // Add delegation
    registry.delegations.add(sender, to);

    // Track delegators of the delegate
    if (!registry.delegators_of.contains(to)) {
        registry.delegators_of.add(to, vector::empty());
    };
    let delegators = registry.delegators_of.borrow_mut(to);
    delegators.push_back(sender);

    event::emit(DelegationCreated {
        delegator: sender,
        delegate: to,
    });
}

/// Revoke an existing delegation
public fun revoke(
    registry: &mut DelegationRegistry,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();

    // Must have an active delegation
    assert!(registry.delegations.contains(sender), ENotDelegated);

    // Get the delegate and remove the delegation
    let delegate = registry.delegations.remove(sender);

    // Remove from delegators_of list
    if (registry.delegators_of.contains(delegate)) {
        let delegators = registry.delegators_of.borrow_mut(delegate);
        let (found, index) = delegators.index_of(&sender);
        if (found) {
            delegators.remove(index);
        };
    };

    event::emit(DelegationRevoked {
        delegator: sender,
        delegate,
    });
}

// === View Functions ===

/// Check if an address has delegated their voting power
public fun has_delegated(registry: &DelegationRegistry, addr: address): bool {
    registry.delegations.contains(addr)
}

/// Get the delegate for an address (returns none if not delegated)
public fun get_delegate(registry: &DelegationRegistry, addr: address): Option<address> {
    if (registry.delegations.contains(addr)) {
        option::some(*registry.delegations.borrow(addr))
    } else {
        option::none()
    }
}

/// Get all addresses that have delegated to a specific delegate
public fun get_delegators(registry: &DelegationRegistry, delegate: address): vector<address> {
    if (registry.delegators_of.contains(delegate)) {
        *registry.delegators_of.borrow(delegate)
    } else {
        vector::empty()
    }
}

/// Get the number of delegators for a delegate
public fun delegator_count(registry: &DelegationRegistry, delegate: address): u64 {
    if (registry.delegators_of.contains(delegate)) {
        registry.delegators_of.borrow(delegate).length()
    } else {
        0
    }
}

// === Test Functions ===

#[test_only]
public fun create_test_registry(ctx: &mut TxContext): DelegationRegistry {
    DelegationRegistry {
        id: object::new(ctx),
        delegations: table::new(ctx),
        delegators_of: table::new(ctx),
    }
}

#[test_only]
public fun destroy_test_registry(registry: DelegationRegistry) {
    let DelegationRegistry {
        id,
        delegations,
        delegators_of,
    } = registry;

    table::drop(delegations);
    table::drop(delegators_of);
    object::delete(id);
}
