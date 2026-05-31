// Tier -> benefit mapping. Pure functions, called by downstream modules
// (Pado fee discount, GoStop max bet floor, AI inference subsidy, Vault
// manager eligibility, etc.). Centralizing here keeps policy values in one
// place — any downstream package that links nasun_tier inherits the same
// policy semantics.
//
// Values are intentionally constants for the prototype. Phase 2+ may migrate
// to a `PolicyConfig` shared object if governance-style tuning is needed.
module nasun_tier::policy;

use nasun_tier::tier;

// === Pado spot fee discount (basis points off baseline fee) ===
// Tier 1 = no discount, Tier 2 = 35% off, Tier 3 = 60% off.
// (Baseline fee = Hyperliquid retail tier; Tier 3 effective fee competes
// with Hyperliquid VIP.)
public fun fee_discount_bps(t: u8): u64 {
    if (t == tier::tier_3()) { 6000 }
    else if (t == tier::tier_2()) { 3500 }
    else { 0 }
}

// === Staking emission multiplier (bps; 10000 = 1.0x) ===
public fun staking_multiplier_bps(t: u8): u64 {
    if (t == tier::tier_3()) { 15000 }
    else if (t == tier::tier_2()) { 12500 }
    else { 10000 }
}

// === GoStop bankroll LP yield multiplier (bps; treasury subsidy) ===
public fun lp_yield_multiplier_bps(t: u8): u64 {
    if (t == tier::tier_3()) { 16000 }
    else if (t == tier::tier_2()) { 13000 }
    else { 10000 }
}

// === AI inference subsidy (bps of operator's inference cost paid by treasury) ===
public fun inference_subsidy_bps(t: u8): u64 {
    if (t == tier::tier_3()) { 6000 }
    else if (t == tier::tier_2()) { 3000 }
    else { 0 }
}

// === GoStop max bet floor (NUSDC micro-units; 6 decimals) ===
// Tier 1 = $100, Tier 2 = $1,000, Tier 3 = $10,000.
// Compared with MAX against the game's own max_bet — this is a floor, never
// a ceiling.
public fun max_bet_floor_usdc(t: u8): u64 {
    if (t == tier::tier_3()) { 10_000_000_000 }    // 10000 * 10^6
    else if (t == tier::tier_2()) { 1_000_000_000 } // 1000  * 10^6
    else { 100_000_000 }                            // 100   * 10^6
}

// === Vault manager eligibility (Tier 3 only) ===
public fun can_create_vault(t: u8): bool {
    t == tier::tier_3()
}

// === JSON_ANCHOR — off-chain parity SSOT (do not desync) ===
//
// Off-chain mirror in `packages/nasun-standing/src/benefits.ts` parses the
// JSON block below and asserts equality with TIER_BENEFITS. Any change to
// the entry functions above MUST update this block in the same commit.
// Keep keys aligned with the Move function names exactly.
//
// JSON_ANCHOR:
// {
//   "fee_discount_bps":        { "1": 0,           "2": 3500,        "3": 6000        },
//   "staking_multiplier_bps":  { "1": 10000,       "2": 12500,       "3": 15000       },
//   "lp_yield_multiplier_bps": { "1": 10000,       "2": 13000,       "3": 16000       },
//   "inference_subsidy_bps":   { "1": 0,           "2": 3000,        "3": 6000        },
//   "max_bet_floor_usdc":      { "1": 100000000,   "2": 1000000000,  "3": 10000000000 },
//   "can_create_vault":        { "1": false,       "2": false,       "3": true        }
// }
