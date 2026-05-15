/// Agent Profile module for Baram-AER
/// Lightweight on-chain identity for AI agents.
/// Owned object — only the owner can modify.
#[allow(lint(self_transfer))]
module baram_agent::agent_profile {
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use std::string::String;

    // ========== Error Codes (500-599 range) ==========
    const E_NOT_OWNER: u64 = 500;
    const E_AGENT_ALREADY_REGISTERED: u64 = 501;
    #[allow(unused_const)]
    const E_AGENT_NOT_FOUND: u64 = 502;
    const E_TOO_MANY_CAPABILITIES: u64 = 503;
    const E_NAME_TOO_LONG: u64 = 504;
    const E_ROLE_TOO_LONG: u64 = 505;
    const E_ALREADY_ACTIVE: u64 = 506;
    const E_ALREADY_INACTIVE: u64 = 507;
    const E_CAPABILITY_NOT_LINKED: u64 = 508;
    const E_CAPABILITY_ALREADY_LINKED: u64 = 509;

    // ========== Constants ==========
    const MAX_CAPABILITIES: u64 = 10;
    const MAX_NAME_LENGTH: u64 = 64;
    const MAX_ROLE_LENGTH: u64 = 32;

    // ========== Structs ==========

    /// On-chain identity for an AI agent.
    /// Owned object - transferred to the human owner.
    public struct AgentProfile has key, store {
        id: UID,
        // Identity
        owner: address,
        agent_address: address,
        name: String,
        role: String,
        // Free-text capability labels surfaced in the dashboard. Unrelated to
        // the Plan B Capability object (see `capability` below).
        capabilities: vector<String>,

        // State
        is_active: bool,
        created_at: u64,
        last_active_at: u64,

        // Stats (updated via increment_stats)
        total_executions: u64,
        total_spent: u64,

        // Plan B: optional pointer to a baram_aer::capability::Capability
        // shared object. Host reads this to fetch the capability for every
        // wake. None = profile has no execution authority wired up yet.
        // Stored as ID rather than the shared object itself; cap lifetime is
        // independent of the profile and revoke flips a flag rather than
        // destroying the object.
        capability: Option<ID>,
    }

    /// Shared registry mapping agent addresses to profile IDs.
    /// Prevents duplicate agent registrations.
    public struct AgentProfileRegistry has key {
        id: UID,
        profiles: Table<address, ID>,
        total_agents: u64,
        active_agents: u64,
    }

    // ========== Events ==========

    public struct AgentCreated has copy, drop {
        profile_id: address,
        owner: address,
        agent_address: address,
        name: String,
        role: String,
    }

    public struct AgentDeactivated has copy, drop {
        profile_id: address,
        agent_address: address,
        owner: address,
    }

    public struct AgentReactivated has copy, drop {
        profile_id: address,
        agent_address: address,
        owner: address,
    }

    public struct AgentStatsUpdated has copy, drop {
        agent_address: address,
        total_executions: u64,
        total_spent: u64,
    }

    public struct AgentCapabilityLinked has copy, drop {
        profile_id: address,
        agent_address: address,
        owner: address,
        capability_id: ID,
    }

    public struct AgentCapabilityUnlinked has copy, drop {
        profile_id: address,
        agent_address: address,
        owner: address,
        previous_capability_id: ID,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let registry = AgentProfileRegistry {
            id: object::new(ctx),
            profiles: table::new(ctx),
            total_agents: 0,
            active_agents: 0,
        };
        transfer::share_object(registry);
    }

    // ========== Core Functions ==========

    /// Create a new agent profile. Caller becomes the owner.
    public fun create_agent(
        registry: &mut AgentProfileRegistry,
        agent_address: address,
        name: String,
        role: String,
        capabilities: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();

        // Validate name length
        assert!(name.length() <= MAX_NAME_LENGTH, E_NAME_TOO_LONG);
        // Validate role length
        assert!(role.length() <= MAX_ROLE_LENGTH, E_ROLE_TOO_LONG);
        // Validate capabilities count
        assert!(capabilities.length() <= MAX_CAPABILITIES, E_TOO_MANY_CAPABILITIES);
        // Prevent duplicate agent registration
        assert!(!table::contains(&registry.profiles, agent_address), E_AGENT_ALREADY_REGISTERED);

        let now = clock.timestamp_ms();

        let profile = AgentProfile {
            id: object::new(ctx),
            owner: sender,
            agent_address,
            name,
            role,
            capabilities,
            is_active: true,
            created_at: now,
            last_active_at: now,
            total_executions: 0,
            total_spent: 0,
            capability: option::none(),
        };

        let profile_id = object::id_address(&profile);

        // Register in shared registry
        table::add(&mut registry.profiles, agent_address, object::id(&profile));
        registry.total_agents = registry.total_agents + 1;
        registry.active_agents = registry.active_agents + 1;

        event::emit(AgentCreated {
            profile_id,
            owner: sender,
            agent_address,
            name: profile.name,
            role: profile.role,
        });

        // Transfer to owner (owned object)
        transfer::public_transfer(profile, sender);
    }

    /// Variant of `create_agent` that pre-links a capability id in a
    /// single tx. Used by the wallet's atomic-setup PTB so AgentProfile,
    /// Capability, and AgentEscrow are all created and bound under one
    /// user signature. Emits both `AgentCreated` and
    /// `AgentCapabilityLinked` so indexers see the link without diffing
    /// state.
    public fun create_agent_with_capability(
        registry: &mut AgentProfileRegistry,
        agent_address: address,
        name: String,
        role: String,
        capabilities: vector<String>,
        capability_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();

        assert!(name.length() <= MAX_NAME_LENGTH, E_NAME_TOO_LONG);
        assert!(role.length() <= MAX_ROLE_LENGTH, E_ROLE_TOO_LONG);
        assert!(capabilities.length() <= MAX_CAPABILITIES, E_TOO_MANY_CAPABILITIES);
        assert!(!table::contains(&registry.profiles, agent_address), E_AGENT_ALREADY_REGISTERED);

        let now = clock.timestamp_ms();

        let profile = AgentProfile {
            id: object::new(ctx),
            owner: sender,
            agent_address,
            name,
            role,
            capabilities,
            is_active: true,
            created_at: now,
            last_active_at: now,
            total_executions: 0,
            total_spent: 0,
            capability: option::some(capability_id),
        };

        let profile_id = object::id_address(&profile);

        table::add(&mut registry.profiles, agent_address, object::id(&profile));
        registry.total_agents = registry.total_agents + 1;
        registry.active_agents = registry.active_agents + 1;

        event::emit(AgentCreated {
            profile_id,
            owner: sender,
            agent_address,
            name: profile.name,
            role: profile.role,
        });

        event::emit(AgentCapabilityLinked {
            profile_id,
            agent_address: profile.agent_address,
            owner: sender,
            capability_id,
        });

        transfer::public_transfer(profile, sender);
    }

    /// Emergency deactivate agent. Owner only.
    /// Budget checks should respect is_active == false.
    public fun deactivate_agent(
        registry: &mut AgentProfileRegistry,
        profile: &mut AgentProfile,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert!(profile.owner == sender, E_NOT_OWNER);
        assert!(profile.is_active, E_ALREADY_INACTIVE);

        profile.is_active = false;
        registry.active_agents = registry.active_agents - 1;

        event::emit(AgentDeactivated {
            profile_id: object::id_address(profile),
            agent_address: profile.agent_address,
            owner: sender,
        });
    }

    /// Reactivate a deactivated agent. Owner only.
    public fun reactivate_agent(
        registry: &mut AgentProfileRegistry,
        profile: &mut AgentProfile,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert!(profile.owner == sender, E_NOT_OWNER);
        assert!(!profile.is_active, E_ALREADY_ACTIVE);

        profile.is_active = true;
        registry.active_agents = registry.active_agents + 1;

        event::emit(AgentReactivated {
            profile_id: object::id_address(profile),
            agent_address: profile.agent_address,
            owner: sender,
        });
    }

    /// Link a Plan B Capability to this AgentProfile by id. Owner only.
    ///
    /// Stored as a bare ID so the cap's lifecycle stays independent: the
    /// wallet revokes a cap by mutating the shared Capability object, not by
    /// touching this profile. To swap caps the user calls unlink_capability
    /// then link_capability with a new id; this keeps the audit trail (event
    /// stream) clean rather than mutating the link in place.
    public fun link_capability(
        profile: &mut AgentProfile,
        capability_id: ID,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert!(profile.owner == sender, E_NOT_OWNER);

        // Force unlink-then-link discipline: if a capability is already linked
        // the owner must explicitly unlink before linking a new one. This
        // surfaces a CapabilityUnlinked event for the indexer so the swap is
        // visible without diffing two link events.
        assert!(option::is_none(&profile.capability), E_CAPABILITY_ALREADY_LINKED);

        profile.capability = option::some(capability_id);

        event::emit(AgentCapabilityLinked {
            profile_id: object::id_address(profile),
            agent_address: profile.agent_address,
            owner: sender,
            capability_id,
        });
    }

    /// Unlink the currently-linked Capability. Owner only. Aborts if no cap
    /// is linked (E_CAPABILITY_NOT_LINKED).
    public fun unlink_capability(
        profile: &mut AgentProfile,
        ctx: &TxContext,
    ) {
        let sender = ctx.sender();
        assert!(profile.owner == sender, E_NOT_OWNER);
        assert!(option::is_some(&profile.capability), E_CAPABILITY_NOT_LINKED);

        let previous = option::extract(&mut profile.capability);

        event::emit(AgentCapabilityUnlinked {
            profile_id: object::id_address(profile),
            agent_address: profile.agent_address,
            owner: sender,
            previous_capability_id: previous,
        });
    }

    /// Update agent stats after a budget spend or execution.
    /// Called by anyone holding a mutable ref (typically in a PTB by the owner).
    public fun increment_stats(
        profile: &mut AgentProfile,
        spent_amount: u64,
        clock: &Clock,
    ) {
        profile.total_executions = profile.total_executions + 1;
        profile.total_spent = profile.total_spent + spent_amount;
        profile.last_active_at = clock.timestamp_ms();

        event::emit(AgentStatsUpdated {
            agent_address: profile.agent_address,
            total_executions: profile.total_executions,
            total_spent: profile.total_spent,
        });
    }

    // ========== View Functions ==========

    public fun is_active(profile: &AgentProfile): bool { profile.is_active }
    public fun get_owner(profile: &AgentProfile): address { profile.owner }
    public fun get_agent_address(profile: &AgentProfile): address { profile.agent_address }
    public fun get_name(profile: &AgentProfile): &String { &profile.name }
    public fun get_role(profile: &AgentProfile): &String { &profile.role }
    public fun get_capabilities(profile: &AgentProfile): &vector<String> { &profile.capabilities }
    public fun get_total_executions(profile: &AgentProfile): u64 { profile.total_executions }
    public fun get_total_spent(profile: &AgentProfile): u64 { profile.total_spent }
    public fun get_last_active_at(profile: &AgentProfile): u64 { profile.last_active_at }
    public fun get_created_at(profile: &AgentProfile): u64 { profile.created_at }
    public fun get_capability(profile: &AgentProfile): Option<ID> { profile.capability }

    // ========== Registry View Functions ==========

    public fun get_total_agents(registry: &AgentProfileRegistry): u64 { registry.total_agents }
    public fun get_active_agents(registry: &AgentProfileRegistry): u64 { registry.active_agents }
    public fun is_agent_registered(registry: &AgentProfileRegistry, agent_address: address): bool {
        table::contains(&registry.profiles, agent_address)
    }
    public fun get_profile_id(registry: &AgentProfileRegistry, agent_address: address): ID {
        *table::borrow(&registry.profiles, agent_address)
    }

    // ========== Test Helpers ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
