# Phase 3 deepbookv3 source delta (2026-05-25)

`apps/pado/deepbookv3` is registered as a git submodule in `apps/pado/.gitmodules` (pointer `2527253d15710b67a3e35d79d19c07c69782cd9a`, MystenLabs/deepbookv3 fork). The submodule's inner `.git` is missing in this working tree, so source edits inside the submodule path are **not tracked** by the monorepo or any inner submodule git.

Phase 3 Move source delta was applied to the live devnet (deepbook upgrade `0xea69229a69fa59babff9a746583694d06551b74bcd5c26200bc58b4edc7c8d55`) but the source itself only lives in the developer's working tree. This directory preserves a snapshot so the changes survive a worktree reset and can be re-applied to a future Pado-controlled fork repo.

## Files

| Snapshot here | Original path | Change |
|---|---|---|
| `deepbook-Move.toml` | `packages/deepbook/Move.toml` | `published-at` bumped to `0xea69229a...`, `[addresses] deepbook` set to original `0xb4a100f2...`, `nasun_tier` local dep added, Sui+MoveStdlib overrides added |
| `token-Move.toml` | `packages/token/Move.toml` | `[addresses] token` hygiene fix `0x0` → original `0x71afcf8e...` |
| `state.move` | `packages/deepbook/sources/state/state.move` | New `process_create_with_tier(...)` (mirror of `process_create` with discount applied) |
| `governance.move` | `packages/deepbook/sources/state/governance.move` | New `set_trade_params_by_admin(...)` + `TradeParamsAdminUpdate` event. Whitelisted-pool guard intentionally not duplicated (admin path is allowed on whitelisted pools) |
| `pool.move` | `packages/deepbook/sources/pool.move` | Side-by-side v2 entries: `place_limit_order_v2`, `place_market_order_v2`, `swap_exact_base_for_quote_v2`, `swap_exact_quote_for_base_v2`, internal `swap_exact_quantity_v2` + private `place_order_int_with_tier`. Public admin wrapper `admin_set_trade_params` |
| `state_tier_tests.move` | `packages/deepbook/tests/state/state_tier_tests.move` | 4 new unit tests covering tier 1/2/3 effective fees + table-miss default |

## Follow-up architectural decision

The submodule needs to be (a) replaced with a Pado-controlled fork repo + pushed, (b) converted from gitlink to embedded tree, or (c) left as-is with this snapshot serving as the canonical source of Phase 3 deltas. Decision is for the user; not required to ship Phase 3 since on-chain state is already correct.
