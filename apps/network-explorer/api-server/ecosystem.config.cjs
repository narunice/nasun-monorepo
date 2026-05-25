const fs = require('fs');
const path = require('path');

// Auto-load .env file so PM2 restart/start always picks up all env vars.
// Previously required manual `set -a && source .env && set +a` before pm2 restart.
function loadDotenv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    vars[key] = val;
  }
  return vars;
}

module.exports = {
  apps: [
    {
      name: 'explorer-api',
      script: 'node',
      args: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3200,
        CHAIN_ID: '272218f1',
        ...loadDotenv(),
      },
      // 768M gives room for in-memory caches (wallet, referral, activations).
      // PM2 now directly spawns node (not tsx launcher), so memory tracking works.
      max_memory_restart: '768M',
      // sql.end({timeout:5}) needs up to 5s; add 3s buffer before SIGKILL.
      kill_timeout: 8000,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
    {
      // Isolated NSI compute worker. Keeps the main explorer-api scanLoop
      // free of any tier logic. Cron jobs are individually gated by
      // ENABLE_* env flags so each can be rolled out independently.
      name: 'tier-worker',
      script: 'node',
      args: 'dist/workers/tier-worker.js',
      env: {
        NODE_ENV: 'production',
        CHAIN_ID: '272218f1',
        ...loadDotenv(),
      },
      max_memory_restart: '512M',
      kill_timeout: 8000,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
    {
      // Phase 4 D4: process-level isolation for off-chain -> on-chain
      // TierRegistry sync. A signAndExecute hang or RPC blip here must
      // not stall NSI compute (tier-worker) or HTTP traffic (explorer-api).
      // Gated by ENABLE_TIER_PUSH so it stays dark until the operator opts in.
      name: 'tier-push-worker',
      script: 'node',
      args: 'dist/workers/tier-push-worker.js',
      env: {
        NODE_ENV: 'production',
        CHAIN_ID: '272218f1',
        ...loadDotenv(),
      },
      max_memory_restart: '256M',
      kill_timeout: 8000,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
    },
  ],
};
