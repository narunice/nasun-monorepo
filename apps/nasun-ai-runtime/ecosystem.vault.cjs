/**
 * PM2 ecosystem config for the managed-vault agent (PRESET=vault).
 *
 * Separate from ecosystem.nasun-ai-runtime.cjs (the trader standalone) and
 * from chat-server's per-user agent spawns: the vault agent is an
 * operator-run process that manages ONE Nasun Vault by signing
 * `execute_trade` directly with the vault's authorized agent key. It does
 * NOT route through the host /execute-capability or Lambda /execute paths
 * and is NOT budget/AER instrumented (see presets/vault-trade.ts header).
 *
 * Secrets and per-deployment identifiers (keys, vault id, agent profile id,
 * contract ids) live in the remote `/home/ec2-user/nasun-ai-runtime/.env`,
 * NOT in this file. This config only carries non-secret behavior defaults.
 * The runtime loads .env at boot, so .env values override / fill the env
 * required by loadConfigBaseSync + loadVaultConfig.
 *
 * Safe-by-default: VAULT_DRY_RUN is NOT set to false here. The agent stays
 * in dry-run (build + devInspect, no signing, no funds moved) until an
 * operator explicitly sets VAULT_DRY_RUN=false in the remote .env. See the
 * live-transition runbook before flipping it.
 *
 * Required in remote .env (verified against src/config.ts):
 *   Baram contracts (unconditional requireEnv):
 *     BARAM_PACKAGE_ID, BARAM_REGISTRY_ID, BUDGET_ID, BARAM_API_KEY,
 *     EXECUTOR_ADDRESS
 *   Vault identity (loadVaultConfig):
 *     VAULT_ID            = managed vault object id
 *     AGENT_PROFILE_ID    = vault.agent_profile_id (cross-checked on-chain;
 *                           wrong value disables the kill switch -> refuses
 *                           to run)
 *   Agent key (one of):
 *     AGENT_PRIVATE_KEY   = the vault.agent_address key, OR
 *     AGENT_SECRET_PARAM  = SSM Parameter Store path holding it (preferred)
 *   LLM seam (optional; absent -> deterministic mean-reversion band):
 *     LLM_API_URL, LLM_API_KEY, LLM_MODEL
 *
 * Optional caps (have safe defaults in loadVaultConfig):
 *   VAULT_BAND_BPS (50), VAULT_STEP_QTY_RAW (1000),
 *   VAULT_MAX_NOTIONAL_RAW (1_000_000 = 1 NUSDC),
 *   VAULT_DAILY_MAX_NOTIONAL_RAW (10_000_000 = 10 NUSDC),
 *   VAULT_MAX_SLIPPAGE_BPS (100), VAULT_ALLOW_SELL (false)
 *
 * Start (manual, operator-driven):
 *   pm2 start /home/ec2-user/nasun-ai-runtime/ecosystem.vault.cjs
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'nasun-ai-vault',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      // The vault loop is heartbeat-only: index.ts skips the /wake server for
      // PRESET=vault (its wake path would route to the trader cycle), so no
      // WAKE_PORT is set here. Cycles fire every INTERVAL_MINUTES.
      env: {
        PRESET: 'vault',
        INTERVAL_MINUTES: '30',
        RPC_URL: 'https://rpc.devnet.nasun.io',
        NODE_ENV: 'production',
        // Safe default: stays in dry-run until the operator sets
        // VAULT_DRY_RUN=false in the remote .env. Do NOT hardcode false here.
      },
    },
  ],
};
