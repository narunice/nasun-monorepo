# Prediction Market v5 Fresh-Publish Cutover — Handoff

> **Status:** **COMPLETED 2026-05-20** (commit `7da8f7f5`). See [Completion Record](#completion-record-2026-05-20) at the bottom.
> **Date:** 2026-05-20
> **Source session:** Admin recovery + UFC + multi-category batch launch
> **Goal:** Permanently close the v3 `mint_admin_cap_via_upgrade*` privilege-escalation path by publishing a **fresh** prediction_market package (new originalId, new AdminCap, new type identity). Existing v1~v4 markets keep running until natural resolution.

---

## TL;DR for the next session

1. **Run `nasun client publish` (not upgrade) on `apps/pado/contracts-prediction`** to mint a brand-new package with a new originalId. The init() fires fresh, transferring a new AdminCap to the publisher (`0xe1c4c90b…`).
2. **Update `packages/devnet-config/devnet-ids.json`** — add a `prediction_v5` block, rename current entry to `prediction_legacy` (don't delete it; legacy markets still need the originalId for type filtering).
3. **Bot side: trivial.** Set `PREDICTION_PACKAGE_ID=<v5>` and `PREDICTION_PACKAGE_ID_LEGACY=<v4 + originalId>` in `apps/pado/bots/.env`. The bots already grep for legacy ids (see `prediction-arb-bot.ts:43`, `prediction-keeper.ts:571`, `prediction-lp-bot.ts:988`). Restart pm2.
4. **Frontend side: medium.** `apps/pado/frontend/src/features/prediction/constants.ts` exposes a single `PREDICTION_PACKAGE_ID` and `PREDICTION_ORIGINAL_PACKAGE_ID`. Split into `LEGACY_*` + `V5_*` and dispatch by the market object's type field at moveCall time. Type filter for object discovery should accept BOTH originalIds.
5. **Don't migrate existing markets.** They keep running with their existing resolver (keeper) and natural close-time + cancel_expired_market fallback. Stranded v3 AdminCap (`0x4661cb7b…`) is irrelevant after cutover — v5 admin functions take a different type, and v1~v4 markets don't need admin in their happy path.
6. **No new markets on v4 after cutover.** All `create-*-batch` scripts default to `.env`'s `PREDICTION_PACKAGE_ID` (which now points at v5), and we already bulk-bumped `DEFAULT_ADMIN_CAP` in [02887aa5](https://github.com/narunice/nasun-monorepo/commit/02887aa5).

---

## Current State Snapshot (as of 2026-05-20 ~02:00 UTC)

### Packages on chain

| Package | ID | Status |
|---|---|---|
| v1 (original publish) | `0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d` | originalId for type identity, holds 117+ markets |
| v2 (upgrade) | `0x0b4f89ade5ca63c737369c50f30721839ce9bb1b9cadd371924520c4944572ef` | adds `merge_positions*` |
| v3 (upgrade) | `0xca68c776715f4c6b87461048aaf39aa6a5a278f3f0bf907d5caedb6fc869f50c` | adds (then-unsafe) `mint_admin_cap_via_upgrade*` — **HIGH severity vuln, directly callable forever** |
| v4 (upgrade, current "latest") | `0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00` | abort body on the unsafe path. New markets created against this packageId since 2026-05-20 ~01:50 UTC |
| **v5 (target — fresh publish, new originalId)** | TBD | what this session creates |

UpgradeCap `0xc6d1492efe2ac4cde7cdb9a14aa8e180981b98327a2b483d610c007daac7831c` chains all four versions. Will be left as-is; v5 publishes from scratch.

### AdminCaps in circulation

| Cap | Type-by | Owner | Notes |
|---|---|---|---|
| `0x63ddeb9b…` | `0xbe6d8f69::AdminCap` | `0x4661cb7b…` | **Stranded.** Created at v1 init, transferred via `rotate-prediction-admin-wallet.ts` on 2026-05-19, key written to `/tmp` which was cleaned. **Key lost forever.** |
| `0xd90ae72d…` | `0xbe6d8f69::AdminCap` | `0xe1c4c90b…` | Live working cap. Minted via the (now-disabled) v3 recovery function on 2026-05-20 01:25 UTC. Same originalId type as stranded one — both are admin for v1~v4. |
| **v5 cap** | `<new originalId>::AdminCap` | publisher (`0xe1c4c90b…`) | Created by v5 `init()` at publish time. Different type identity, cannot be substituted for the legacy caps. |

After cutover, only the v5 cap matters for new markets. The legacy live cap (`0xd90ae72d…`) is still usable on v1~v4 admin functions but those markets don't need admin in steady state.

### Markets distribution (rough count)

- v1~v2: ~117 markets created over many weeks (sports, crypto, weather, music, space, finance reissues etc.)
- v4: 39 markets created in this session (7 UFC + 14 crypto + 9 finance + 5 soccer + 4 weather + 2 space + 2 music; 5 finance duplicates cancelled, 1 SOL 1d crypto missing due to gas race)
- v5: 0 (target — start fresh)

Many of those have close_times within the next 1-7 days. **Do not break their resolution path during cutover.** The keeper subscribes by originalId-anchored `MoveEventType`, so legacy markets stay discoverable as long as `PREDICTION_PACKAGE_ID_LEGACY` is set.

### Operational risk window

The v3 unsafe path (`0xca68c776::prediction_market::mint_admin_cap_via_upgrade_entry`) is callable forever — Sui upgrade does not retire old package bytecode. Anyone holding any `&UpgradeCap` can mint a legacy AdminCap. **Cutover does not patch this; it sidesteps it** by making the new originalId's admin functions reject the legacy AdminCap type.

Until cutover lands, monitor-admin-recovery-abuse.ts polls v3 for unauthorised calls. The Telegram alert path is unwired (per user decision) — stdout/pm2 logs only. Risk acceptance: devnet + low TVL + finite exposure window.

### Stranded admin attack surface (post-cutover)

If an attacker exploits v3 to mint a legacy AdminCap, they can:
- `admin_cancel_market` any open v1~v4 market → forces pro-rata refund mode (griefing of legacy markets, not v5)
- `create_market` on v1~v4 with confederate resolver → user funds rug, but **only if a user trades on the new bogus legacy market.** Frontend will be updated to discover both legacy and v5 markets, so attacker-created legacy markets *would* surface in the UI if the discovery filter is too broad.
- `extend_resolve_deadline` on legacy markets → freezes legacy collateral

Mitigation: frontend discovery should optionally accept a hard cutoff timestamp so post-cutover legacy markets are not shown. Document this in the cutover ticket.

---

## Files and exact changes needed

### Move source (`apps/pado/contracts-prediction/`)

**Decision: keep v4 source as-is for v5 publish.** The `mint_admin_cap_via_upgrade*` functions in v4 source abort immediately — harmless even when republished. Removing them on v5 is cleaner but requires another commit; cleanliness can come in a follow-up. Either path is fine.

If you choose to remove them:
- Delete the entire `// ===== Admin Recovery (DEPRECATED in v4) =====` block in `sources/prediction_market.move:274-298`.
- Delete the matching tests in `tests/prediction_market_tests.move`.
- Delete `EAdminRecoveryDeprecated` const + the `use sui::package::UpgradeCap;` import.
- Run `nasun move test` to verify the suite still passes (currently 25 tests).

### Move.toml (`apps/pado/contracts-prediction/Move.toml`)

Before `nasun client publish`, verify:
```toml
[package]
name = "prediction"
edition = "2024.beta"
published-at = "0x..."  # ← REMOVE this line for fresh publish

[addresses]
prediction = "0x0"      # ← MUST be 0x0 for fresh publish (gets replaced)
```

If `published-at` is set, the CLI will treat the package as an upgrade candidate. Removing it forces fresh publish.

After `client publish` succeeds, the CLI prints the new packageId. Copy it back into Move.toml:
```toml
published-at = "<new v5 packageId>"
[addresses]
prediction = "<new v5 packageId>"
```

### `packages/devnet-config/devnet-ids.json`

Current `prediction` block (line ~26):
```json
"prediction": {
  "packageId": "0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00",
  "originalPackageId": "0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d",
  "adminCap": "0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8",
  "upgradeCap": "0xc6d1492efe2ac4cde7cdb9a14aa8e180981b98327a2b483d610c007daac7831c"
}
```

Target:
```json
"prediction": {
  "packageId": "<v5 latest>",
  "originalPackageId": "<v5 originalId (== v5 packageId for fresh publish)>",
  "adminCap": "<v5 new AdminCap>",
  "upgradeCap": "<v5 new UpgradeCap>"
},
"prediction_legacy": {
  "packageId": "0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00",
  "originalPackageId": "0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d",
  "adminCap": "0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8",
  "upgradeCap": "0xc6d1492efe2ac4cde7cdb9a14aa8e180981b98327a2b483d610c007daac7831c",
  "cutoverDate": "2026-05-20",
  "notes": "Read-only after v5 cutover. Legacy markets resolve naturally; admin paths (admin_cancel, extend_resolve_deadline) intentionally not used. v3 unsafe mint_admin_cap path callable forever via direct packageId invocation — accepted risk."
}
```

Bump the `version` field at the top of the file (currently "V8" — pick "V9" or a more descriptive label).

### Bots (`apps/pado/bots/.env`)

```bash
# Current:
PREDICTION_PACKAGE_ID=0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00
PREDICTION_ADMIN_CAP=0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8

# After cutover:
PREDICTION_PACKAGE_ID=<v5 latest>
PREDICTION_ADMIN_CAP=<v5 new AdminCap>
# Comma-separated list of every legacy packageId the keeper / arb / lp bots
# should also discover markets in. Include both v1 (originalId, the type
# anchor) and v4 (latest legacy alias).
PREDICTION_PACKAGE_ID_LEGACY=0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d,0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00
```

Pre-edit backup runs automatically via the project PreToolUse hook. The PostToolUse duplicate-key checker fires after the edit; address any warnings before proceeding.

Bot pm2 restart sequence on prod EC2 (43.200.67.52):
```bash
ssh prod  # ec2-user@43.200.67.52
cd apps/pado/bots
pm2 stop pado-prediction-arb pado-prediction-keeper pado-prediction-lp  # adjust names
# (Pulling the latest commit and updating .env should already be done via deploy script)
export $(cat .env | grep -v '^#' | xargs)
pm2 startOrRestart ecosystem.config.cjs
pm2 logs pado-prediction-keeper --lines 30  # verify subscription includes both originalIds
```

Verify keeper logs show `legacy packages=<v1>,<v4>` line at startup ([prediction-arb-bot.ts:443](apps/pado/bots/prediction-arb-bot.ts#L443) and similar lines in keeper).

### Bot batch scripts

The 18 scripts under `apps/pado/bots/scripts/create-*.ts` have `DEFAULT_ADMIN_CAP` hardcoded as `0xd90ae72d…` (the legacy live cap). After cutover, bulk-update to the new v5 cap:

```bash
sed -i 's/0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8/<NEW_V5_ADMIN_CAP>/g' \
  apps/pado/bots/scripts/create-*.ts \
  apps/pado/bots/scripts/admin-cancel-sports-reissue.ts \
  apps/pado/bots/scripts/rotate-prediction-admin-wallet.ts
```

Verify no occurrences of the old cap remain:
```bash
grep -l "0xd90ae72d" apps/pado/bots/scripts/*.ts | head -5  # should print nothing
```

### Frontend (`apps/pado/frontend/src/features/prediction/`)

**This is the medium-effort piece.** Frontend currently uses a single `PREDICTION_PACKAGE_ID` and `PREDICTION_ORIGINAL_PACKAGE_ID` import from `@nasun/devnet-config`.

`constants.ts:18`:
```ts
export const PREDICTION_PACKAGE_ID = PREDICTION.packageId;
export const PREDICTION_ORIGINAL_PACKAGE_ID = PREDICTION.originalPackageId ?? PREDICTION.packageId;
```

Target after cutover:
```ts
import { PREDICTION, PREDICTION_LEGACY } from '@nasun/devnet-config';

export const V5_PACKAGE_ID = PREDICTION.packageId;
export const V5_ORIGINAL_PACKAGE_ID = PREDICTION.originalPackageId;
export const V5_ADMIN_CAP = PREDICTION.adminCap;

export const LEGACY_PACKAGE_ID = PREDICTION_LEGACY.packageId;
export const LEGACY_ORIGINAL_PACKAGE_ID = PREDICTION_LEGACY.originalPackageId;

/** Discovery: filter markets by either originalId. */
export const PREDICTION_ORIGINAL_IDS = [
  V5_ORIGINAL_PACKAGE_ID,
  LEGACY_ORIGINAL_PACKAGE_ID,
] as const;

/** Select the right packageId for a moveCall based on the market object's type. */
export function packageIdForMarket(marketObjectType: string): string {
  if (marketObjectType.startsWith(LEGACY_ORIGINAL_PACKAGE_ID)) return LEGACY_PACKAGE_ID;
  if (marketObjectType.startsWith(V5_ORIGINAL_PACKAGE_ID)) return V5_PACKAGE_ID;
  throw new Error(`unknown prediction market type: ${marketObjectType}`);
}
```

Every site that builds a `moveCall` in `transactions.ts` must call `packageIdForMarket(market.type)` instead of using the global `PREDICTION_PACKAGE_ID`:
- `mint_outcome_tokens`
- `place_buy_maker` / `place_sell_maker`
- `place_buy_taker` / `place_sell_taker`
- `cancel_order`
- `claim_resting_order_refund`
- `claim_winnings`
- `burn_losing_position`
- `merge_positions*` (only defined on v4 legacy, not v5 yet — design decision: re-add to v5 source? If yes, merge needs the right packageId too)

Object discovery (probably in a hook like `useMarket` or `useMarkets`):
- Currently filters by `<originalId>::prediction_market::Market`
- Update to accept both originalIds

`@nasun/devnet-config` exports change ([packages/devnet-config/index.ts](packages/devnet-config/index.ts)): add a `PREDICTION_LEGACY` export reading the new `prediction_legacy` block from devnet-ids.json. Mirror the existing PREDICTION export shape.

### Frontend env (`apps/pado/.env.production` — note pado uses `envDir: '../'`)

No change required — frontend reads packageIds via `@nasun/devnet-config` which reads `devnet-ids.json` at build time. Updating `devnet-ids.json` is sufficient. **But you MUST rebuild + redeploy** because `VITE_*` envs and the imported JSON both get embedded in `dist/`. Use `/env-verify pado` after build to confirm.

Deploy command (user-only per `feedback_pado_prod_website_deploy_user_only.md`):
```bash
pnpm build:pado && pnpm deploy:pado:prod -- --force
```

---

## Cutover sequence

Recommended order. Each step should pass before moving on.

### Step 0: Pre-flight

- [ ] Verify `0xe1c4c90b…` is active in `nasun client active-address`
- [ ] Confirm gas balance (`nasun client gas`) > 1 SUI
- [ ] On prod EC2: pause prediction-arb (`pm2 stop pado-prediction-arb`) for the duration of cutover to avoid gas-coin races against the publish tx and subsequent admin-cap mint. Restart at the end.
- [ ] `cd apps/pado/contracts-prediction && nasun move test` — confirm 25/25 pass

### Step 1: Publish v5

```bash
cd apps/pado/contracts-prediction
# Backup Move.toml, then strip published-at and reset [addresses]
nasun client publish --gas-budget 500000000
```

Capture from the output:
- New packageId (this is the v5 originalId AND latest, identical for fresh publish)
- New UpgradeCap object id (created by publish, owned by signer)
- New AdminCap object id (created by `init()`, owned by signer)

Confirm via:
```bash
nasun client objects --owner 0xe1c4c90b... | grep -E "(UpgradeCap|AdminCap)"
```

### Step 2: Update Move.toml + Move.lock

- Add `published-at = "<v5>"` back to Move.toml
- Update `[addresses] prediction = "<v5>"`
- Commit Move.lock changes if any

### Step 3: Update devnet-ids.json

Per spec above. Keep legacy block, add v5 block as new canonical `prediction`. Bump version field.

### Step 4: Update .env

Per spec above. PreToolUse hook backs up automatically.

### Step 5: Restart bots (local + prod)

Local (if running anything): leave alone or restart with new .env.

Prod EC2:
```bash
ssh prod
cd /home/ec2-user/apps/pado/bots  # or wherever it lives
git pull
# Sync .env from monorepo (or edit in place)
pm2 stop all  # or specific bot list
export $(cat .env | grep -v '^#' | xargs)
pm2 startOrRestart ecosystem.config.cjs
pm2 logs --lines 50  # verify legacy ids logged
```

### Step 6: Bot batch script bulk-update

```bash
sed -i 's/0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8/<v5_admin_cap>/g' \
  apps/pado/bots/scripts/create-*.ts \
  apps/pado/bots/scripts/admin-cancel-sports-reissue.ts \
  apps/pado/bots/scripts/rotate-prediction-admin-wallet.ts
```

### Step 7: Frontend changes

Per spec above. This is multi-file:
- `@nasun/devnet-config` package: export `PREDICTION_LEGACY`
- `frontend/src/features/prediction/constants.ts`: split + `packageIdForMarket` helper
- `frontend/src/features/prediction/transactions.ts`: every moveCall calls `packageIdForMarket(market.type)`
- Wherever markets are fetched: filter accepts both originalIds
- `useMarket` / `useMarkets` / similar hooks: pass market type through to moveCall consumers

Run `pnpm test` and the existing prediction tests. Verify type-check passes.

### Step 8: Verify legacy still works

Before deploying frontend, exercise locally:
- `pnpm dev:pado` against current devnet
- Load a v4 legacy market (e.g. one of the UFC fights — Yi Sak Lee market `0x302a64a8...`)
- Confirm market detail displays correctly
- Place a 0.01 NUSDC bid (real, devnet)
- Verify tx succeeds against the LEGACY packageId

### Step 9: Create a smoke v5 market

```bash
cd apps/pado/bots
# Edit scripts/create-btc-test-market.ts or similar to point at a small spec
node --env-file=.env --import tsx scripts/create-btc-test-market.ts
```

Verify:
- Tx target package = v5 packageId (not legacy)
- Market object type = `<v5_original>::prediction_market::Market`
- Keeper picks up the event (`pm2 logs pado-prediction-keeper` shows it in the polling cycle)
- Frontend lists it (with both originalIds in the filter)

### Step 10: Bulk-launch v5 batches

After smoke test passes, run the dated category batches as new dated files (don't reuse the 5/20 batch files — those targeted v4). Build a new `create-*-batch-2026-05-21.ts` per category as needed. UFC has remaining future fight nights (276+ already created, future events e.g. 278+ require new SPECS).

### Step 11: Deploy frontend (user-only)

```bash
# User runs locally:
pnpm build:pado
/env-verify pado    # confirm new packageIds embed correctly in dist/assets/*.js
pnpm deploy:pado:prod -- --force
```

### Step 12: Commit + push

Single commit covering:
- Move source (if cleaned up)
- devnet-ids.json
- Frontend changes
- Bot script bulk updates
- This handoff doc updated with "completed" status

---

## Verification checklist

Before declaring cutover done:

- [ ] v5 packageId is the canonical `PREDICTION_PACKAGE_ID` in `.env` + `devnet-ids.json`
- [ ] v5 AdminCap is owned by `0xe1c4c90b…` and its type matches `<v5_original>::prediction_market::AdminCap`
- [ ] Legacy packageIds remain accessible via `PREDICTION_PACKAGE_ID_LEGACY` env
- [ ] Keeper logs at startup print `legacy packages=0xbe6d8f69...,0x9b2361fe...`
- [ ] Frontend lists both legacy markets (e.g. UFC FN 277 fights) AND a v5 smoke market
- [ ] Trade on a legacy market succeeds (moveCall uses LEGACY_PACKAGE_ID)
- [ ] Trade on a v5 market succeeds (moveCall uses V5_PACKAGE_ID)
- [ ] A legacy market resolves naturally via keeper (wait for any market with imminent close)
- [ ] `monitor-admin-recovery-abuse.ts` continues to baseline 0 events on v3 (script unchanged; just confirms no exploitation during cutover)
- [ ] No bot in pm2 logs is hitting "package not found" or "wrong cap type" errors

---

## Pitfalls / careful spots

### 1. `Move.toml` `published-at` toggle

Forgetting to strip `published-at` before `nasun client publish` makes the CLI complain that the package is already published. Forgetting to add it back afterward makes subsequent `client upgrade` calls fail. Backup Move.toml before the toggle.

### 2. AdminCap type drift across packages

`<v5_original>::prediction_market::AdminCap` and `<v1_original>::prediction_market::AdminCap` are distinct types even though the struct shape is identical. Sui's type system tags by originalId. **Do not** try to use the legacy AdminCap on v5 moveCalls — it will fail with type mismatch. Each is admin for its own package universe.

### 3. Legacy market discovery filter breadth

If frontend filters markets by `originalId` only, a v3 attacker exploiting the unsafe path can mint a legacy AdminCap and `create_market(...)` on v4 — that bogus market would surface in the UI. Mitigation: include a hard cutoff timestamp (e.g. "ignore legacy markets with `creator` other than `0xe1c4c90b…` AND `createdAt > 2026-05-21T00:00:00Z`"). This is defense-in-depth; the natural defense is that v3 abuse has had baseline 0 hits since publish.

### 4. Bot env hooks may complain about duplicate keys

`scripts/env-duplicate-check.sh` (PostToolUse hook) compares sibling `.env*` files. If you have `.env.local` overriding `PREDICTION_PACKAGE_ID`, the hook will warn. Resolve before bot restart — drift here is what caused the 2026-05-04 chat-server WALLET_MAPPINGS incident.

### 5. Don't `git push` until smoke test passes

The commit will contain devnet-ids.json + frontend + bot script bulk updates. If you push before verifying, prod EC2's next `git pull` will surface broken behavior. Push only after Step 9 (smoke v5 market) succeeds.

### 6. Existing markets' resolver address

Each market has a fixed `resolver` address at creation. Keeper's address (`0xd413721d…`) is the resolver for all known markets. Don't rotate the keeper key as part of cutover — it would orphan resolution for every legacy market.

### 7. `cancel_expired_market` is permissionless

Even though the stranded AdminCap path is dead, `cancel_expired_market` works for anyone after `resolve_deadline + EXPIRE_GRACE_MS`. Postponed/abandoned legacy markets will refund users automatically. No manual intervention needed.

### 8. `nasun client publish` gas

Fresh publish costs more than upgrade (storage rebate is smaller). 500M MIST budget should be safe; if it fails on insufficient gas, bump to 1B.

### 9. Frontend type filter caching

If `useMarket`/`useMarkets` caches by query key derived from packageId, splitting into two filters may cache-collide. Verify React Query keys include the originalId. Bust caches once in dev to confirm.

### 10. Move source cleanup is optional

You can publish v5 with the abort-body recovery functions still present. They're harmless (they abort). Removing them is cleaner but adds churn — defer if the cutover is already large in this session.

---

## Out of scope for this session

- **Re-adding admin recovery to v5.** The `mint_admin_cap_via_upgrade*` pattern has been proven foot-gun-prone. If admin recovery is needed in the future, design it with a SharedConfig + originalId hardcoded check, or rely on fresh publish (this very procedure) for bus-factor.
- **Migrating legacy markets.** They keep running. No object migration. Users hold positions in legacy markets and naturally exit via `claim_winnings` / `burn_losing_position` / `cancel_expired_market`.
- **Telegram alert wiring for the monitor.** Skipped by user decision. The script is in the repo for selective enablement later.
- **Retiring legacy packageIds from PREDICTION_PACKAGE_ID_LEGACY.** Long-tail; eventually all legacy markets close out and the legacy block in devnet-ids.json can be deleted. Plan for ~3-6 months out.

---

## Reference: relevant memory entries

- `project_2026_05_19_pado_price_10x_regression` — recent prediction market incident (not cutover-related but shows operational style)
- `feedback_grep_source_before_designing_move_upgrade` — applies here: source-grep before deciding which functions to remove from v5 source
- `feedback_pado_prod_website_deploy_user_only` — prod website deploy is user-only
- `feedback_pm2_env_management` — pm2 env semantics, important for bot restart
- `reference_keystore_unified` — consolidated keystore (sui + nasun share one file)

## Reference: relevant prior commits

- `02887aa5` (this session) — UFC + admin recovery v3+v4 + multi-category batches
- `d0aff30b` — v2 upgrade publish state (merge_positions)
- `b7eb40ac` — Move.lock bump
- `f3cc775f` — merge_positions feature itself

---

## Completion Record (2026-05-20)

Cutover landed in a single session on 2026-05-20 ~03:30 UTC. Final state on chain and in code:

### Captured IDs

| Slot | Value |
|---|---|
| v5 packageId (== originalId for fresh publish) | `0x86595464922e006fd3af117dfee3f879796184e09e01b877379080c156a997b2` |
| v5 AdminCap | `0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1` |
| v5 UpgradeCap | `0x58cc21a22c5931511441701608954f85c4886ac8e2f5d38013d0113e1bc92fff` |
| Publish tx digest | `83QWe8eofKSJwKDQfSFc9eeudCNA62J892iuEWpK18Bw` |
| v5 smoke market (BTC $100k @ 2026-05-23 04:00 UTC) | `0x058c3930ac9e5ff55d5bd91c1b7e95fa4fb1d0b94541be22faa0b383b6d662f2` |
| Legacy packageId (latest v4, used as moveCall target for legacy markets) | `0x9b2361feee43b5912efc21918fd8c8cc94c40ed443bb34bea0d7dc9775a37d00` |
| Legacy originalId (v1, type anchor for ~117 legacy markets) | `0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d` |
| Legacy AdminCap (still owned, kept for legacy admin paths) | `0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8` |

Owner of v5 caps + admin wallet: `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90`.

### Step-by-step outcomes (mapped to the original sequence above)

- **Steps 0~6 (on-chain + config + bot scripts):** all done. `Published.toml` auto-rewrote to v5 (CLI manages this in the newer toolchain; the legacy block was preserved to `.legacy.bak` during the publish run and deleted post-commit). 19 bot scripts had `DEFAULT_ADMIN_CAP` bulk-sed legacy → v5.
- **Step 7 (frontend):** implemented as a `marketPackageRegistry` populated by `fetchMarket` (single source-of-truth for `marketId → packageId` dispatch). Every transaction builder reads from it via `packageForMarket(marketId, override?)`. Discovery + event polling + position filters all accept both originalIds. Typecheck clean. 63/63 prediction unit tests pass.
- **Step 8 (legacy verify):** user manually verified two legacy markets — BNB market `0x6d3c8236...` and `0xe10ea517...`. NO buy succeeded on the second; the first had NO ask side empty (operational, not cutover-related — see below).
- **Step 9 (v5 smoke):** market created, on-chain type confirmed as `0x86595464...::prediction_market::Market`.
- **Step 10 (v5 category batches):** deferred. Legacy 175 markets remain in flight, no urgent need.
- **Step 11 (frontend deploy):** user-only step. `pnpm deploy:pado:prod -- --force` completed and verified by user.
- **Step 12 (commit):** single commit `7da8f7f5`, 35 files, +909/-167. Push deferred (CLAUDE.md "never push without explicit instruction"). User-side dirty files (74 unrelated to cutover) deliberately left unstaged.

### Production bot reconcile (post-cutover follow-up)

`apps/pado/bots/.env` on prod EC2 (`/home/ec2-user/pado-bots/.env`) was updated in-place via SSH:
- `PREDICTION_PACKAGE_ID` → v5
- `PREDICTION_ADMIN_CAP` → v5 cap (replaced a **stranded** AdminCap `0x63ddeb9b...` that had been in prod env since at least 2026-05-19, undetected; bot's admin paths would have failed silently if invoked)
- `PREDICTION_PACKAGE_ID_LEGACY` → v1 originalId + v4 latest comma-separated
- `PREDICTION_ADMIN_CAP_LEGACY` → legacy live cap `0xd90ae72d...`

Then `pm2 delete prediction-{arb,keeper,lp} && pm2 start ecosystem.config.cjs --only ...` per `feedback_pm2_hard_restart_for_new_env.md` (new env keys need delete+start, not restart, because the pm2 daemon caches env at parse time).

LP bot startup log line `Legacy packages: 0xbe6d8f69..., 0x9b2361fe...` and `Watching 176 market(s) after discovery` confirmed both originalIds were recognized. ARB resumed arb cycles within seconds. v5 smoke market auto-mint + 4-side × 10-level ladder seeded within ~1 minute.

### Unexpected findings (worth memory pinning)

1. **Stranded AdminCap in prod env.** `/home/ec2-user/pado-bots/.env` had `PREDICTION_ADMIN_CAP=0x63ddeb9b...` — the original v1 init AdminCap that was transferred via `rotate-prediction-admin-wallet.ts` on 2026-05-19 with the recipient key written to `/tmp` (since cleaned). Any admin call (`admin_cancel_market`, `extend_resolve_deadline`, etc.) would have aborted with `ENotOwner`. The v5 cutover surfaced this only because the env got compared key-by-key during reconcile. Pinned to memory as `project_pado_prediction_v5_cutover` for future audits.
2. **ARB bot signs transactions with the admin keypair (`0xe1c4c90b…`), not `PREDICTION_ARB_PRIVATE_KEY`.** Initial audit using `Sender: ARB_ADDR` event filter returned 0 events and looked like a 12-day-stale bot; the real evidence (`[arb] done. estimated profit: ...`) was in the pm2 log. When auditing bot heartbeat by on-chain events, query by `address=0xe1c4c90b...` for arb activity, not by the bot's nominal address.
3. **The `seed-no-asks-adhoc.ts` workflow.** When a new market has empty ask side because LP bot hasn't picked up inventory yet, the simplest fix is to restart the LP bot (it self-mints + ladders). The ad-hoc script (`apps/pado/bots/scripts/seed-no-asks-adhoc.ts`) is a fallback for cases where the bot is paused. Includes LockConflict safety warning in its docstring per `project_pado_bot_single_instance.md`.

### Known follow-ups (out of session)

- **v5 category batch markets.** Optional. Make `create-*-batch-2026-MM-DD.ts` per category if you want fresh v5 inventory before legacy 175 close out.
- **Retire `PREDICTION_PACKAGE_ID_LEGACY` env / `prediction_legacy` json block.** When all legacy markets resolve or cancel (~3-6 months out). Frontend will collapse `MARKET_TYPES`/`POSITION_TYPES` to single-element arrays automatically (dedup logic in `constants.ts`).
- **`Move.toml` `published-at` line was already stale** (pointed at v2) before this session. Commented out for fresh publish. The newer Sui toolchain manages `Published.toml` instead — `Move.toml` no longer needs `published-at` for upgrades.
- **`/tmp` cleanup eating recipient keys** — the same root cause that stranded the v3 admin cap. Any future `rotate-prediction-admin-wallet.ts` runs should write the recipient key to `~/.sui/sui_config/` or `~/.nasun/nasun_config/`, not `/tmp`.
